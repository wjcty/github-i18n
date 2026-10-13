import type { Repository, TranslationTask } from "@prisma/client";
import type { ScopeConfig } from "@/types/api";

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string");
  return [];
}

export function parseScopeConfig(value: unknown): ScopeConfig {
  const v = value as Partial<ScopeConfig> | null;
  return {
    mode: "paths",
    includePaths: v?.includePaths ?? ["README.md"],
    excludePaths: v?.excludePaths ?? [],
  };
}

export function translationStatusFromTask(
  task: TranslationTask | null | undefined,
): string {
  if (!task) return "not_started";
  if (task.status === "pending" || task.status === "running") return "in_progress";
  if (task.status === "failed") return "error";
  if (task.status === "completed" || task.status === "skipped") return "synced";
  return "not_started";
}

export function taskProgress(task: {
  totalFiles: number;
  doneFiles: number;
  currentFile: string | null;
}) {
  const percent =
    task.totalFiles > 0
      ? Math.round((task.doneFiles / task.totalFiles) * 100)
      : 0;
  return {
    totalFiles: task.totalFiles,
    doneFiles: task.doneFiles,
    currentFile: task.currentFile,
    percent,
  };
}

export function repoListItem(
  repo: Repository,
  lastTask: TranslationTask | null,
  lastPrUrl: string | null,
) {
  return {
    id: repo.id,
    fullName: repo.fullName,
    defaultBranch: repo.defaultBranch,
    baseLanguage: repo.baseLanguage,
    targetLanguages: parseJsonArray(repo.targetLanguages),
    autoSyncEnabled: repo.autoSyncEnabled,
    lastTranslatedBaseCommit: repo.lastTranslatedBaseCommit,
    lastPrUrl,
    lastTask: lastTask
      ? {
          id: lastTask.id,
          status: lastTask.status,
          finishedAt: lastTask.finishedAt?.toISOString() ?? null,
        }
      : null,
    translationStatus: translationStatusFromTask(lastTask),
  };
}
