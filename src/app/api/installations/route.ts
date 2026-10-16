import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-session";
import {
  GitHubUserAuthError,
  isGitHubNetworkError,
  withUserOctokit,
} from "@/lib/github/user-token";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import {
  installationAccountLogin,
  installationAccountType,
} from "@/lib/github/installation-account";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { data } = await withUserOctokit(auth.user.id, (octokit) =>
      octokit.rest.apps.listInstallationsForAuthenticatedUser(),
    );

    const items = [];
    for (const inst of data.installations) {
      if (!inst.id) continue;
      const record = await prisma.installation.upsert({
        where: { installationId: inst.id },
        create: {
          installationId: inst.id,
          accountLogin: installationAccountLogin(inst.account),
          accountType: installationAccountType(inst.account),
          repositorySelection: inst.repository_selection ?? null,
        },
        update: {
          accountLogin: installationAccountLogin(inst.account),
          accountType: installationAccountType(inst.account),
          repositorySelection: inst.repository_selection ?? null,
        },
      });
      await prisma.repository.updateMany({
        where: {
          userId: auth.user.id,
          owner: installationAccountLogin(inst.account),
          installationId: { not: inst.id },
        },
        data: {
          installationId: inst.id,
          installationRecordId: record.id,
          treeCachedAt: null,
        },
      });
      items.push({
        installationId: inst.id,
        accountLogin: installationAccountLogin(inst.account),
        accountType: installationAccountType(inst.account),
        repositorySelection: inst.repository_selection ?? "all",
      });
    }

    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof GitHubUserAuthError) {
      return apiError(401, "UNAUTHORIZED", err.message);
    }
    if (isGitHubNetworkError(err)) {
      console.error("[installations] GitHub network error:", err);
      return apiError(502, "INTERNAL_ERROR", "连接 GitHub 失败，请检查网络后重试");
    }
    console.error("[installations] list failed:", err);
    return apiError(500, "INTERNAL_ERROR", "获取 GitHub App 安装信息失败");
  }
}
