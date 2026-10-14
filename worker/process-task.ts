import type { Octokit } from "octokit";
import { prisma } from "@/lib/db";
import { getInstallationOctokit } from "@/lib/github/app";
import { openRouterChat, resolveApiKeyForUser } from "@/lib/openrouter";
import { parseJsonArray, parseScopeConfig } from "@/lib/repos/mapper";
import { filterTranslatablePaths } from "@/lib/translation/scope";
import { translatedPath, isMarkdown } from "@/lib/translation/paths";
import { upsertReadmeTranslationBlock } from "@/lib/translation/readme-links";
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

function shortId(id: string): string {
  return id.slice(-6);
}

function branchName(repoId: string, taskId: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `github-i18n/${repoId}-${ymd}-${shortId(taskId)}`;
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
    const octokit = await getInstallationOctokit(repo.installationId);
    const { data: repoMeta } = await octokit.rest.repos.get({ owner, repo: name });
    const defaultBranch = repoMeta.default_branch;
    let headSha: string;
    try {
      headSha =
        task.afterCommit ??
        (await octokit.rest.repos.getBranch({ owner, repo: name, branch: defaultBranch }))
          .data.commit.sha;
    } catch (e) {
      const status = (e as { status?: number }).status;
      const message = e instanceof Error ? e.message : "";
      const emptyRepo =
        status === 404 ||
        status === 409 ||
        /Branch not found|Git Repository is empty/i.test(message);
      if (emptyRepo) {
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

    let candidatePaths: string[] = [];
    if (task.mode === "incremental" && repo.lastTranslatedBaseCommit) {
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
      repo.ignoreFileContent,
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
    const headBranch = branchName(repo.id, taskId);

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

      const sourceText = await getFileContent(octokit, owner, name, filePath, headSha);
      if (!sourceText) continue;

      for (const lang of targets) {
        let translated = await translateMarkdown(
          key,
          model,
          repo.baseLanguage,
          lang,
          filePath,
          sourceText,
        );

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

    const baseReadme = files.find((f) => f.toLowerCase() === "readme.md");
    if (baseReadme) {
      const readmeSource = await getFileContent(octokit, owner, name, baseReadme, headSha);
      if (readmeSource) {
        const updated = upsertReadmeTranslationBlock(
          readmeSource,
          targets,
          repo.baseLanguage,
        );
        if (updated !== readmeSource) {
          fileOutputs.push({ path: baseReadme, content: updated });
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

    const commitMessage = `[github-i18n] chore(i18n): translations (${targets.join(", ")})`;
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
    await prisma.translationTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        errorMessage: message.slice(0, 4000),
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}
