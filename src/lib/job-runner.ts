import { prisma } from "@/lib/db";
import {
  claimNextJob,
  completeJob,
  failJob,
  reflectTaskFailure,
} from "@/lib/jobs";
import { processTranslationTask } from "../../worker/process-task";

/**
 * 超过这段时间没有任何进度，就认为执行进程已经被平台杀掉（例如 Vercel 到了 maxDuration）。
 * 必须长于单次函数上限，避免把仍在翻译的任务抢走。
 */
export const STALE_MS = 8 * 60 * 1000;

async function reclaimStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_MS);
  const stale = await prisma.job.findMany({
    where: {
      status: "running",
      lockedAt: { lt: cutoff },
      task: { updatedAt: { lt: cutoff } },
    },
  });

  for (const job of stale) {
    console.error(
      `[job-runner] reclaim stale job ${job.id} task ${job.taskId}`,
    );
    await prisma.translationTask.update({
      where: { id: job.taskId },
      data: {
        errorMessage: "翻译进程中断（服务端执行超时），将自动重试",
      },
    });
    await failJob(job.id, 0);
    await reflectTaskFailure(job.taskId, job.attempts);
  }
}

/** 取一条到期任务并执行。没有可执行任务时返回 false。 */
export async function runNextJob(): Promise<boolean> {
  await reclaimStaleJobs();
  const job = await claimNextJob();
  if (!job) return false;

  console.log(
    `[job-runner] running task ${job.taskId} attempt ${job.attempts}`,
  );
  try {
    await processTranslationTask(job.taskId);
    await completeJob(job.id);
  } catch (err) {
    console.error(
      `[job-runner] task ${job.taskId} attempt ${job.attempts} failed:`,
      err,
    );
    await failJob(job.id, 5000 * job.attempts);
    await reflectTaskFailure(job.taskId, job.attempts);
  }
  return true;
}

export async function drainDueJobs() {
  try {
    while (await runNextJob()) {
      /* 同一轮把当前到期的任务都跑完 */
    }
  } catch (err) {
    console.error("[job-runner] drain error", err);
  }
}

