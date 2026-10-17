import "@/lib/env";
import { runNextJob } from "@/lib/job-runner";

const POLL_MS = 1500;

async function loop() {
  // eslint-disable-next-line no-console
  console.log("[worker] started");
  for (;;) {
    try {
      const ran = await runNextJob();
      if (!ran) await sleep(POLL_MS);
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
