import { prisma } from "@/lib/db";

export async function enqueueTaskJob(taskId: string) {
  const job = await prisma.job.create({
    data: {
      taskId,
      status: "pending",
      runAt: new Date(),
    },
  });
  const { scheduleDrain } = await import("@/lib/schedule-drain");
  scheduleDrain();
  return job;
}

export async function claimNextJob() {
  const job = await prisma.job.findFirst({
    where: { status: "pending", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
  });
  if (!job) return null;

  const updated = await prisma.job.updateMany({
    where: { id: job.id, status: "pending" },
    data: {
      status: "running",
      lockedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (updated.count === 0) return null;

  return prisma.job.findUnique({
    where: { id: job.id },
    include: {
      task: {
        include: {
          repository: { include: { user: { include: { settings: true } } } },
        },
      },
    },
  });
}

export async function completeJob(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "completed", lockedAt: null },
  });
}

const MAX_ATTEMPTS = 3;

/**
 * 一次尝试失败后更新任务状态：
 * - 还会自动重试 → 回到 pending，前端继续显示“排队中/执行中”，不误报失败；
 * - 重试次数用尽 → 置为 failed 并记录完成时间。
 */
export async function reflectTaskFailure(taskId: string, attempts: number) {
  const willRetry = attempts < MAX_ATTEMPTS;
  await prisma.translationTask.update({
    where: { id: taskId },
    data: willRetry
      ? { status: "pending", currentFile: null, finishedAt: null }
      : { status: "failed", currentFile: null, finishedAt: new Date() },
  });
}

export async function failJob(jobId: string, retryDelayMs: number) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.attempts >= 3) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "failed", lockedAt: null },
    });
    return;
  }
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "pending",
      lockedAt: null,
      runAt: new Date(Date.now() + retryDelayMs),
    },
  });
}
