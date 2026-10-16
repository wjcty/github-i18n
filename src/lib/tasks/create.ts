import { prisma } from "@/lib/db";
import { enqueueTaskJob } from "@/lib/jobs";
import { parseJsonArray } from "@/lib/repos/mapper";
import { LANGUAGE_CODES } from "@/lib/constants";
import { resolveApiKeyForUser } from "@/lib/openrouter";

export async function validateLanguages(
  baseLanguage: string,
  targetLanguages: string[],
) {
  if (targetLanguages.length === 0) {
    throw new Error("At least one target language is required");
  }
  for (const lang of targetLanguages) {
    if (!LANGUAGE_CODES.has(lang)) throw new Error(`Invalid language: ${lang}`);
    if (lang === baseLanguage) throw new Error("Target language cannot equal base language");
  }
}

export async function createTranslationTask(input: {
  repoId: string;
  userId: string;
  mode: "full" | "incremental";
  trigger: "manual" | "webhook";
  targetLanguages?: string[];
  webhookDeliveryId?: string;
  afterCommit?: string;
  /** Webhook 场景：仅翻译这些已筛选路径 */
  changedPaths?: string[];
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { settings: true },
  });
  if (!user) throw new Error("User not found");
  if (!user.emailVerified) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  const repo = await prisma.repository.findFirst({
    where: { id: input.repoId, userId: input.userId },
  });
  if (!repo) throw new Error("Repository not found");

  const targets =
    input.targetLanguages ?? parseJsonArray(repo.targetLanguages);
  await validateLanguages(repo.baseLanguage, targets);

  try {
    await resolveApiKeyForUser(input.userId);
  } catch (e) {
    throw new Error((e as Error).message);
  }

  const task = await prisma.translationTask.create({
    data: {
      repositoryId: repo.id,
      mode: input.mode,
      trigger: input.trigger,
      webhookDeliveryId: input.webhookDeliveryId,
      afterCommit: input.afterCommit,
      changedPaths: input.changedPaths ?? undefined,
      targetLanguages: targets,
      status: "pending",
    },
  });

  await enqueueTaskJob(task.id);
  return task;
}
