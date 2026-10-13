import "@/lib/env";
import { claimNextJob, completeJob, failJob } from "@/lib/jobs";
import { processTranslationTask } from "./process-task";

const POLL_MS = 1500;

async function loop() {
  // eslint-disable-next-line no-console
  console.log("[worker] started");
  for (;;) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(POLL_MS);
        continue;
      }
      try {
        await processTranslationTask(job.taskId);
        await completeJob(job.id);
      } catch {
        await failJob(job.id, 5000 * job.attempts);
        const task = job.task;
        if (job.attempts >= 3 && task) {
          // task already marked failed in processTranslationTask
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] poll error", err);
      await sleep(POLL_MS);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

loop();
