import { prisma } from "@/lib/db";

export async function enqueueTaskJob(taskId: string) {
  return prisma.job.create({
    data: {
      taskId,
      status: "pending",
      runAt: new Date(),
    },
  });
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
