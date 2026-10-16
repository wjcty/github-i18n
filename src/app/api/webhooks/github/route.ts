import { Webhooks } from "@octokit/webhooks";
import { prisma } from "@/lib/db";
import { createTranslationTask } from "@/lib/tasks/create";
import {
  installationAccountLogin,
  installationAccountType,
} from "@/lib/github/installation-account";
import { getInstallationOctokit } from "@/lib/github/app";
import { parseScopeConfig } from "@/lib/repos/mapper";
import {
  extractChangedPathsFromPush,
  filterInScopeDocChanges,
} from "@/lib/webhooks/push-changed-files";
import { isMarkdown } from "@/lib/translation/paths";
import { isTranslationCommitMessage } from "@/lib/constants";

export const runtime = "nodejs";

/** 本次 push 全部为平台翻译提交时忽略，避免合并/推送译文触发循环 */
function isOnlyTranslationCommits(payload: Record<string, unknown>): boolean {
  const head = payload.head_commit as { message?: string } | null | undefined;
  const commits = payload.commits as { message?: string }[] | undefined;

  if (Array.isArray(commits) && commits.length > 0) {
    return commits.every((c) => isTranslationCommitMessage(c.message));
  }
  return isTranslationCommitMessage(head?.message);
}

function getWebhooks() {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) throw new Error("GITHUB_APP_WEBHOOK_SECRET is not set");
  return new Webhooks({ secret });
}

async function resolveChangedPaths(input: {
  payload: Record<string, unknown>;
  owner: string;
  name: string;
  installationId: number;
  before: string | undefined;
  after: string;
}): Promise<string[]> {
  const fromPayload = extractChangedPathsFromPush({
    commits: input.payload.commits as
      | { added?: string[]; modified?: string[] }[]
      | undefined,
    head_commit: input.payload.head_commit as
      | { added?: string[]; modified?: string[] }
      | null
      | undefined,
  });

  // commits 被截断或为空时，用 compare(before...after) 兜底
  const before = input.before;
  const needCompare =
    fromPayload.length === 0 ||
    Boolean(input.payload.truncated) ||
    (Array.isArray(input.payload.commits) &&
      (input.payload.commits as unknown[]).length >= 20);

  if (
    !needCompare ||
    !before ||
    before === "0000000000000000000000000000000000000000"
  ) {
    return fromPayload;
  }

  try {
    const octokit = await getInstallationOctokit(input.installationId);
    const { data } = await octokit.rest.repos.compareCommits({
      owner: input.owner,
      repo: input.name,
      base: before,
      head: input.after,
    });
    return (data.files ?? [])
      .filter((f) => f.status !== "removed" && f.filename && isMarkdown(f.filename))
      .map((f) => f.filename!);
  } catch {
    return fromPayload;
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const id = request.headers.get("x-github-delivery") ?? "";
  const name = request.headers.get("x-github-event") ?? "";
  const sig = request.headers.get("x-hub-signature-256") ?? "";

  if (!id || !name || !sig) {
    return new Response("Missing webhook headers", { status: 400 });
  }

  try {
    const webhooks = getWebhooks();
    await webhooks.verify(body, sig);
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    await prisma.webhookDelivery.create({
      data: { deliveryId: id, event: name, repoFullName: null },
    });
  } catch {
    return new Response("OK", { status: 200 });
  }

  const payload = JSON.parse(body) as Record<string, unknown>;

  if (name === "push") {
    const ref = payload.ref as string | undefined;
    const repo = payload.repository as
      | {
          full_name?: string;
          default_branch?: string;
          name?: string;
          owner?: { login?: string };
        }
      | undefined;
    const installation = payload.installation as { id?: number } | undefined;
    const after = payload.after as string | undefined;
    const before = payload.before as string | undefined;

    if (!repo?.full_name || !installation?.id || !after) {
      return new Response("OK", { status: 200 });
    }

    // 忽略删除分支等 after 为全 0 的事件
    if (after === "0000000000000000000000000000000000000000") {
      return new Response("OK", { status: 200 });
    }

    const defaultBranch = repo.default_branch ?? "main";
    if (ref !== `refs/heads/${defaultBranch}`) {
      return new Response("OK", { status: 200 });
    }

    // 忽略本平台创建的翻译分支（若误推到非默认分支已在上方过滤）
    const branch = ref.replace("refs/heads/", "");
    if (branch.startsWith("translations-") || branch.startsWith("github-i18n/")) {
      return new Response("OK", { status: 200 });
    }

    // 忽略以 [github-i18n] 开头的提交，防止翻译结果再触发自动翻译
    if (isOnlyTranslationCommits(payload)) {
      return new Response("OK", { status: 200 });
    }

    const platformRepo = await prisma.repository.findFirst({
      where: {
        installationId: installation.id,
        fullName: repo.full_name,
        autoTranslate: true,
      },
    });

    if (!platformRepo) {
      return new Response("OK", { status: 200 });
    }

    const [owner, repoName] = repo.full_name.split("/");
    if (!owner || !repoName) {
      return new Response("OK", { status: 200 });
    }

    const changedPaths = await resolveChangedPaths({
      payload,
      owner,
      name: repoName,
      installationId: installation.id,
      before,
      after,
    });

    const scope = parseScopeConfig(platformRepo.scopeConfig);
    const inScope = filterInScopeDocChanges(
      changedPaths,
      scope,
      platformRepo.ignoreFileContent ?? "",
    );

    if (inScope.length === 0) {
      return new Response("OK", { status: 200 });
    }

    try {
      await createTranslationTask({
        repoId: platformRepo.id,
        userId: platformRepo.userId,
        mode: "incremental",
        trigger: "webhook",
        webhookDeliveryId: id,
        afterCommit: after,
        changedPaths: inScope,
      });
    } catch {
      /* ignore enqueue errors for webhook（如未验证邮箱、未配 Key） */
    }
  }

  if (name === "installation" || name === "installation_repositories") {
    const installation = payload.installation as {
      id?: number;
      account?: { login?: string; type?: string };
      repository_selection?: string;
    };
    if (installation?.id) {
      await prisma.installation.upsert({
        where: { installationId: installation.id },
        create: {
          installationId: installation.id,
          accountLogin: installationAccountLogin(installation.account),
          accountType: installationAccountType(installation.account),
          repositorySelection: installation.repository_selection ?? null,
        },
        update: {
          accountLogin: installationAccountLogin(installation.account),
          accountType: installationAccountType(installation.account),
          repositorySelection: installation.repository_selection ?? null,
        },
      });
    }
  }

  return new Response("OK", { status: 200 });
}
