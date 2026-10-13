import type { Repository, TranslationTask } from "@prisma/client";
import { parseJsonArray, taskProgress } from "@/lib/repos/mapper";

export function taskAcceptedResponse(task: TranslationTask) {
  return {
    taskId: task.id,
    status: task.status,
    mode: task.mode,
    trigger: task.trigger,
    progressUrl: `/api/tasks/${task.id}`,
    eventsUrl: `/api/tasks/${task.id}/events`,
    retryCount: task.retryCount,
  };
}

export function taskDetailResponse(task: TranslationTask, repo: Repository) {
  return {
    id: task.id,
    repositoryId: task.repositoryId,
    fullName: repo.fullName,
    status: task.status,
    mode: task.mode,
    trigger: task.trigger,
    progress: taskProgress(task),
    targetLanguages: parseJsonArray(task.targetLanguages),
    headBranch: task.headBranch,
    prUrl: task.prUrl,
    prNumber: task.prNumber,
    skipReason: task.skipReason,
    errorMessage: task.errorMessage,
    retryCount: task.retryCount,
    createdAt: task.createdAt.toISOString(),
    finishedAt: task.finishedAt?.toISOString() ?? null,
  };
}
