import type { Octokit } from "octokit";
import { buildNestedTree } from "@/lib/translation/tree";
import type { TreeNode } from "@/types/api";

const CACHE_MS = 5 * 60 * 1000;

/** 仅空仓库/默认分支不存在才算空；token 生成失败等 404 必须抛出 */
export function isEmptyRepoError(e: unknown): boolean {
  const status = (e as { status?: number }).status;
  const message = e instanceof Error ? e.message : "";
  if (status === 409) return true;
  return /Branch not found|Git Repository is empty/i.test(message);
}

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
  const c = cached.treeCache as
    | { nodes?: TreeNode[]; truncated?: boolean; commitSha?: string }
    | null;
  if (
    !forceRefresh &&
    cached.treeCachedAt &&
    c?.commitSha &&
    c.nodes?.length &&
    now.getTime() - cached.treeCachedAt.getTime() < CACHE_MS
  ) {
    return {
      nodes: c.nodes,
      truncated: Boolean(c.truncated),
      commitSha: c.commitSha,
      cachedAt: cached.treeCachedAt,
    };
  }

  let commitSha: string;
  try {
    const { data: branch } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: defaultBranch,
    });
    commitSha = branch.commit.sha;
  } catch (e) {
    if (isEmptyRepoError(e)) {
      return {
        nodes: [],
        truncated: false,
        commitSha: "",
        cachedAt: now,
      };
    }
    throw e;
  }

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

  // 保持 GitHub tree API 返回顺序；buildNestedTree 内只保留 .md
  const { nodes, truncated } = buildNestedTree(entries);

  return {
    nodes,
    truncated: truncated || Boolean(tree.truncated),
    commitSha,
    cachedAt: now,
  };
}
