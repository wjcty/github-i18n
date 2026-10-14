import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRepoAccess } from "@/lib/auth-session";
import { AppNotInstalledError, getRepoOctokit } from "@/lib/github/repo-octokit";
import { fetchRepoTree } from "@/lib/github/tree-fetch";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";

type Params = { params: Promise<{ repoId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const repoId = (await params).repoId;
  const access = await requireRepoAccess(auth.user.id, repoId);
  if (access.error) return access.error;

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";
  const repo = access.repo;

  try {
    const previousInstallationId = repo.installationId;
    const octokit = await getRepoOctokit(repo);
    const tree = await fetchRepoTree(
      octokit,
      repo.owner,
      repo.name,
      repo.defaultBranch,
      repo.installationId === previousInstallationId
        ? { treeCache: repo.treeCache, treeCachedAt: repo.treeCachedAt }
        : { treeCache: null, treeCachedAt: null },
      forceRefresh,
    );

    if (tree.cachedAt.getTime() !== repo.treeCachedAt?.getTime()) {
      await prisma.repository.update({
        where: { id: repo.id },
        data: {
          treeCache: {
            nodes: tree.nodes,
            truncated: tree.truncated,
            commitSha: tree.commitSha,
          },
          treeCachedAt: tree.cachedAt,
        },
      });
    }

    return NextResponse.json({
      defaultBranch: repo.defaultBranch,
      commitSha: tree.commitSha,
      cachedAt: tree.cachedAt.toISOString(),
      truncated: tree.truncated,
      empty: !tree.commitSha && tree.nodes.length === 0,
      nodes: tree.nodes,
    });
  } catch (e) {
    if (e instanceof AppNotInstalledError) {
      return apiError(403, "FORBIDDEN", e.message);
    }
    return apiError(
      500,
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "Failed to fetch tree",
    );
  }
}
