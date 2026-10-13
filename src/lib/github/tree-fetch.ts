import type { Octokit } from "octokit";
import { buildNestedTree } from "@/lib/translation/tree";
import type { TreeNode } from "@/types/api";

const CACHE_MS = 5 * 60 * 1000;

export async function fetchRepoTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  defaultBranch: string,
  cached: { treeCache: unknown; treeCachedAt: Date | null },
  forceRefresh: boolean,
): Promise<{
  nodes: TreeNode[];
  truncated: boolean;
  commitSha: string;
  cachedAt: Date;
}> {
  const now = new Date();
  if (
    !forceRefresh &&
    cached.treeCachedAt &&
    cached.treeCache &&
    now.getTime() - cached.treeCachedAt.getTime() < CACHE_MS
  ) {
    const c = cached.treeCache as {
      nodes: TreeNode[];
      truncated: boolean;
      commitSha: string;
    };
    return {
      nodes: c.nodes,
      truncated: c.truncated,
      commitSha: c.commitSha,
      cachedAt: cached.treeCachedAt,
    };
  }

  const { data: branch } = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch: defaultBranch,
  });
  const commitSha = branch.commit.sha;

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: commitSha,
    recursive: "1",
  });

  const entries = (tree.tree ?? [])
    .filter((t) => t.path && (t.type === "blob" || t.type === "tree"))
    .map((t) => ({
      path: t.path!,
      type: t.type === "tree" ? ("tree" as const) : ("blob" as const),
    }));

  const { nodes, truncated } = buildNestedTree(
    entries.filter((e) => e.type === "blob").map((e) => ({ path: e.path, type: "blob" as const })),
  );

  return {
    nodes,
    truncated: truncated || Boolean(tree.truncated),
    commitSha,
    cachedAt: now,
  };
}
