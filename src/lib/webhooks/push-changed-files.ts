import type { ScopeConfig } from "@/types/api";
import { filterTranslatablePaths } from "@/lib/translation/scope";

type CommitFiles = {
  added?: string[];
  modified?: string[];
  removed?: string[];
};

/**
 * 从 push payload 收集「新增/修改」的路径（不含删除）。
 * GitHub 在单次 push 超过约 20 个 commit 时会截断 commits 列表，此时返回空，由调用方用 compare 兜底。
 */
export function extractChangedPathsFromPush(payload: {
  commits?: CommitFiles[];
  head_commit?: CommitFiles | null;
  truncated?: boolean;
}): string[] {
  const paths = new Set<string>();
  const commits = payload.commits ?? [];
  for (const c of commits) {
    for (const p of c.added ?? []) paths.add(p);
    for (const p of c.modified ?? []) paths.add(p);
  }
  if (paths.size === 0 && payload.head_commit) {
    for (const p of payload.head_commit.added ?? []) paths.add(p);
    for (const p of payload.head_commit.modified ?? []) paths.add(p);
  }
  return [...paths];
}

/** 筛选：Markdown、非 translations/、落在 include/exclude 与 ignore 规则内 */
export function filterInScopeDocChanges(
  changedPaths: string[],
  scope: ScopeConfig,
  ignoreFileContent: string,
): string[] {
  return filterTranslatablePaths(changedPaths, scope, ignoreFileContent);
}
