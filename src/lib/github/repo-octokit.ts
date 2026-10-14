import type { Octokit } from "octokit";
import { prisma } from "@/lib/db";
import { getGitHubApp, getInstallationOctokit } from "@/lib/github/app";
import {
  installationAccountLogin,
  installationAccountType,
} from "@/lib/github/installation-account";

export class AppNotInstalledError extends Error {
  constructor(fullName: string) {
    super(
      `GitHub App 未安装到仓库 ${fullName} 或无访问权限，请重新安装 GitHub App 并授权该仓库`,
    );
    this.name = "AppNotInstalledError";
  }
}

type RepoRef = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  installationId: number;
};

/**
 * 卸载并重装 GitHub App 后 installationId 会变化，库里旧的 installationId
 * 生成 installation token 时会 404。这里每次通过 App JWT 查询仓库当前所属安装，
 * 若与库中不一致则自动修正。
 */
export async function resolveRepoInstallationId(repo: RepoRef): Promise<number> {
  const app = (await getGitHubApp()) as unknown as {
    octokit: Octokit;
  };

  let installation: {
    id: number;
    account?: unknown;
    repository_selection?: string;
  };
  try {
    const { data } = await app.octokit.rest.apps.getRepoInstallation({
      owner: repo.owner,
      repo: repo.name,
    });
    installation = data;
  } catch (e) {
    if ((e as { status?: number }).status === 404) {
      throw new AppNotInstalledError(repo.fullName);
    }
    throw e;
  }

  if (installation.id !== repo.installationId) {
    const record = await prisma.installation.upsert({
      where: { installationId: installation.id },
      create: {
        installationId: installation.id,
        accountLogin: installationAccountLogin(installation.account),
        accountType: installationAccountType(installation.account),
        repositorySelection: installation.repository_selection ?? null,
      },
      update: {},
    });
    await prisma.repository.updateMany({
      where: { installationId: repo.installationId, owner: repo.owner },
      data: { installationId: installation.id, installationRecordId: record.id },
    });
    await prisma.repository.update({
      where: { id: repo.id },
      data: {
        installationId: installation.id,
        installationRecordId: record.id,
        treeCachedAt: null,
      },
    });
    repo.installationId = installation.id;
  }

  return installation.id;
}

export async function getRepoOctokit(repo: RepoRef): Promise<Octokit> {
  const installationId = await resolveRepoInstallationId(repo);
  return getInstallationOctokit(installationId);
}
