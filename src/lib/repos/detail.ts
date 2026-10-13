import type { Repository, TranslationTask } from "@prisma/client";
import { parseJsonArray, parseScopeConfig } from "@/lib/repos/mapper";

export function repoDetailResponse(
  repo: Repository,
  recentTasks: TranslationTask[],
) {
  const last = recentTasks[0];
  return {
    id: repo.id,
    installationId: repo.installationId,
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    defaultBranch: repo.defaultBranch,
    baseLanguage: repo.baseLanguage,
    targetLanguages: parseJsonArray(repo.targetLanguages),
    autoSyncEnabled: repo.autoSyncEnabled,
    scopeConfig: parseScopeConfig(repo.scopeConfig),
    ignoreFileContent: repo.ignoreFileContent ?? "",
    lastTranslatedBaseCommit: repo.lastTranslatedBaseCommit,
    lastPrUrl: last?.prUrl ?? null,
    lastPrNumber: last?.prNumber ?? null,
    recentTasks: recentTasks.map((t) => ({
      id: t.id,
      status: t.status,
      mode: t.mode,
      trigger: t.trigger,
      createdAt: t.createdAt.toISOString(),
      prUrl: t.prUrl,
    })),
  };
}
