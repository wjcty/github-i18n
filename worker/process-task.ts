import type { Octokit } from "octokit";
import { prisma } from "@/lib/db";
import { getRepoOctokit } from "@/lib/github/repo-octokit";
import { isEmptyRepoError } from "@/lib/github/tree-fetch";
import { openRouterChat, resolveApiKeyForUser } from "@/lib/openrouter";
import { parseJsonArray, parseScopeConfig } from "@/lib/repos/mapper";
import { filterTranslatablePaths } from "@/lib/translation/scope";
import { translatedPath, isMarkdown } from "@/lib/translation/paths";
import {
  isRootReadme,
  isTranslationUpToDate,
  readmeSourceHash,
  stripTranslationBlock,
  upsertReadmeTranslationBlock,
  withSourceMarker,
} from "@/lib/translation/readme-links";
import { TRANSLATION_COMMIT_PREFIX } from "@/lib/constants";
function decodeContent(content: string, encoding: string): string {
  if (encoding === "base64") {
    return Buffer.from(content, "base64").toString("utf8");
  }
  return content;
}

async function listAllMdPaths(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<string[]> {
  const { data } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: ref,
    recursive: "1",
  });
  return (data.tree ?? [])
    .filter((t) => t.type === "blob" && t.path && isMarkdown(t.path))
    .map((t) => t.path!);
}

async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file") return null;
    return decodeContent(data.content, data.encoding);
  } catch {
    return null;
  }
}

async function translateMarkdown(
  apiKey: string,
  model: string,
  sourceLang: string,
  targetLang: string,
  filePath: string,
  source: string,
): Promise<string> {
  const { content } = await openRouterChat(apiKey, [
    {
      role: "system",
      content:
        "You translate Markdown documentation. Preserve code blocks, URLs, front matter, and structure. Output only translated Markdown.",
    },
    {
      role: "user",
      content: `Source language: ${sourceLang}\nTarget language: ${targetLang}\nFile: ${filePath}\n\n${source}`,
    },
  ], model);
  return content.trim();
}

/** 清晰时间戳分支名，例如 translations-20261015-112130 */
function branchName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `translations-${stamp}`;
}

export async function processTranslationTask(taskId: string) {
  const task = await prisma.translationTask.findUnique({
    where: { id: taskId },
    include: {
      repository: { include: { user: { include: { settings: true } } } },
    },
  });
  if (!task) return;

  const repo = task.repository;
  const user = repo.user;
  const owner = repo.owner;
  const name = repo.name;
  const targets = parseJsonArray(task.targetLanguages);
  const scope = parseScopeConfig(repo.scopeConfig);

  await prisma.translationTask.update({
    where: { id: taskId },
    data: { status: "running", errorMessage: null, skipReason: null },
  });

  try {
    const octokit = await getRepoOctokit(repo);
    const { data: repoMeta } = await octokit.rest.repos.get({ owner, repo: name });
    const defaultBranch = repoMeta.default_branch;
    let headSha: string;
    try {
      headSha =
        task.afterCommit ??
        (await octokit.rest.repos.getBranch({ owner, repo: name, branch: defaultBranch }))
          .data.commit.sha;
    } catch (e) {
      if (isEmptyRepoError(e)) {
        await prisma.translationTask.update({
          where: { id: taskId },
          data: {
            status: "skipped",
            skipReason: "EMPTY_REPOSITORY",
            finishedAt: new Date(),
            totalFiles: 0,
            doneFiles: 0,
            currentFile: null,
          },
        });
        return;
      }
      throw e;
    }

    const webhookPaths = parseJsonArray(task.changedPaths);
    let candidatePaths: string[] = [];
    if (webhookPaths.length > 0) {
      // Webhook 增量：仅翻译本次 push 已筛选的变更文档
      candidatePaths = webhookPaths;
    } else if (task.mode === "incremental" && repo.lastTranslatedBaseCommit) {
      const { data: compare } = await octokit.rest.repos.compareCommits({
        owner,
        repo: name,
        base: repo.lastTranslatedBaseCommit,
        head: headSha,
      });
      candidatePaths = (compare.files ?? [])
        .map((f) => f.filename)
        .filter((p): p is string => Boolean(p && isMarkdown(p)));
    } else {
      candidatePaths = await listAllMdPaths(octokit, owner, name, headSha);
    }

    const files = filterTranslatablePaths(
      candidatePaths,
      scope,
      repo.ignoreFileContent ?? "",
    );

    if (files.length === 0) {
      await prisma.translationTask.update({
        where: { id: taskId },
        data: {
          status: "skipped",
          skipReason: "NO_FILES_TO_TRANSLATE",
          finishedAt: new Date(),
          totalFiles: 0,
          doneFiles: 0,
          currentFile: null,
        },
      });
      return;
    }

    const { key, source, model } = await resolveApiKeyForUser(user.id);
    const headBranch = branchName();

    await prisma.translationTask.update({
      where: { id: taskId },
      data: { totalFiles: files.length, doneFiles: 0, headBranch },
    });

    const fileOutputs: { path: string; content: string }[] = [];
    let charsIn = 0;
    let charsOut = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      await prisma.translationTask.update({
        where: { id: taskId },
        data: { currentFile: filePath, doneFiles: i },
      });

      const rawSource = await getFileContent(octokit, owner, name, filePath, headSha);
      if (!rawSource) continue;
      const readme = isRootReadme(filePath);
      const sourceText = readme ? stripTranslationBlock(rawSource) : rawSource;

      for (const lang of targets) {
        let translated = await translateMarkdown(
          key,
          model,
          repo.baseLanguage,
          lang,
          filePath,
          sourceText,
        );
        if (readme) translated = withSourceMarker(translated, readmeSourceHash(rawSource));

        const outPath = translatedPath(lang, filePath);
        fileOutputs.push({ path: outPath, content: translated });

        await prisma.taskPreview.upsert({
          where: {
            taskId_lang_sourcePath: { taskId, lang, sourcePath: filePath },
          },
          create: {
            taskId,
            repositoryId: repo.id,
            lang,
            sourcePath: filePath,
            translatedPath: outPath,
            content: translated,
          },
          update: { content: translated, translatedPath: outPath },
        });

        charsIn += sourceText.length;
        charsOut += translated.length;
      }
    }

    if (repo.ignoreFileContent?.trim()) {
      fileOutputs.push({
        path: ".github-i18n-ignore",
        content: repo.ignoreFileContent.trim() + "\n",
      });
    }

    // 全量（或本次翻译了 README）：
    // 1) 确保 translations/{lang}/README.md 存在且与当前 README 正文一致，否则翻译；
    // 2) 在根目录 README.md 的链接区块中追加本次语言（保留已有语言）。
    const readmeInScope = files.some(isRootReadme);
    if (task.mode === "full" || readmeInScope) {
      const readmeSource = await getFileContent(octokit, owner, name, "README.md", headSha);
      if (readmeSource) {
        if (!readmeInScope) {
          const hash = readmeSourceHash(readmeSource);
          const body = stripTranslationBlock(readmeSource);
          for (const lang of targets) {
            const outPath = translatedPath(lang, "README.md");
            const existing = await getFileContent(octokit, owner, name, outPath, headSha);
            if (isTranslationUpToDate(existing, hash)) continue;

            await prisma.translationTask.update({
              where: { id: taskId },
              data: { currentFile: "README.md" },
            });
            const translated = withSourceMarker(
              await translateMarkdown(key, model, repo.baseLanguage, lang, "README.md", body),
              hash,
            );
            fileOutputs.push({ path: outPath, content: translated });
            charsIn += body.length;
            charsOut += translated.length;
          }
        }

        const updated = upsertReadmeTranslationBlock(
          readmeSource,
          targets,
          repo.baseLanguage,
        );
        if (updated !== readmeSource) {
          fileOutputs.push({ path: "README.md", content: updated });
        }
      }
    }

    const { data: baseCommit } = await octokit.rest.git.getCommit({
      owner,
      repo: name,
      commit_sha: headSha,
    });

    const blobShas: { path: string; sha: string }[] = [];
    for (const f of fileOutputs) {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo: name,
        content: Buffer.from(f.content, "utf8").toString("base64"),
        encoding: "base64",
      });
      blobShas.push({ path: f.path, sha: blob.sha });
    }

    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo: name,
      base_tree: baseCommit.tree.sha,
      tree: blobShas.map((b) => ({
        path: b.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: b.sha,
      })),
    });

    const commitMessage = `${TRANSLATION_COMMIT_PREFIX} chore(i18n): translations (${targets.join(", ")})`;
    const authorName = user.name ?? user.login;
    const authorEmail = user.primaryEmail ?? `${user.githubId}+github-i18n@users.noreply.github.com`;

    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo: name,
      message: commitMessage,
      tree: newTree.sha,
      parents: [headSha],
      author: { name: authorName, email: authorEmail, date: new Date().toISOString() },
      committer: { name: authorName, email: authorEmail, date: new Date().toISOString() },
    });

    try {
      await octokit.rest.git.createRef({
        owner,
        repo: name,
        ref: `refs/heads/${headBranch}`,
        sha: newCommit.sha,
      });
    } catch {
      await octokit.rest.git.updateRef({
        owner,
        repo: name,
        ref: `refs/heads/${headBranch}`,
        sha: newCommit.sha,
        force: true,
      });
    }

    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo: name,
      title: `chore(i18n): add translations for ${targets.join(", ")}`,
      head: headBranch,
      base: defaultBranch,
      body: `Generated by GitHub-i18n\n\nTask: ${taskId}\nFiles: ${files.length}\nTrigger: ${task.trigger}`,
    });

    await prisma.usageRecord.create({
      data: {
        userId: user.id,
        taskId,
        charsIn,
        charsOut,
        model,
        source,
      },
    });

    if (source === "PLATFORM" && user.settings) {
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          platformCharUsed: {
            increment: charsIn + charsOut,
          },
        },
      });
    }

    await prisma.translationTask.update({
      where: { id: taskId },
      data: {
        status: "completed",
        doneFiles: files.length,
        currentFile: null,
        prUrl: pr.html_url,
        prNumber: pr.number,
        headCommitSha: newCommit.sha,
        finishedAt: new Date(),
      },
    });

    await prisma.repository.update({
      where: { id: repo.id },
      data: {
        lastTranslatedBaseCommit: headSha,
        defaultBranch,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 不在这里置为 failed：是否失败由 worker 根据剩余重试次数决定，
    // 否则自动重试期间前端会误报“翻译失败”。
    await prisma.translationTask.update({
      where: { id: taskId },
      data: { errorMessage: message.slice(0, 4000), currentFile: null },
    });
    throw err;
  }
}
