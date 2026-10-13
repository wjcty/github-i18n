import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-session";
import { getUserOctokit } from "@/lib/github/user-token";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import {
  installationAccountLogin,
  installationAccountType,
} from "@/lib/github/installation-account";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const octokit = await getUserOctokit(auth.user.id);
  if (!octokit) {
    return apiError(403, "FORBIDDEN", "GitHub token not available; sign in again");
  }

  const { data } = await octokit.rest.apps.listInstallationsForAuthenticatedUser();
  const items = [];
  for (const inst of data.installations) {
    if (!inst.id) continue;
    await prisma.installation.upsert({
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
    items.push({
      installationId: inst.id,
      accountLogin: installationAccountLogin(inst.account),
      accountType: installationAccountType(inst.account),
      repositorySelection: inst.repository_selection ?? "all",
    });
  }

  return NextResponse.json({ items });
}
