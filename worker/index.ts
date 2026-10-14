import "@/lib/env";
import { claimNextJob, completeJob, failJob, reflectTaskFailure } from "@/lib/jobs";
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
      } catch (err) {
        console.error(
          `[worker] task ${job.taskId} attempt ${job.attempts} failed:`,
          err,
        );
        await failJob(job.id, 5000 * job.attempts);
        await reflectTaskFailure(job.taskId, job.attempts);
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
