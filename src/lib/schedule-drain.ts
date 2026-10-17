import { after } from "next/server";
import { drainDueJobs, STALE_MS } from "@/lib/job-runner";

/** 排队中，或执行中但长时间没有进度时，才值得再拉起一次消费。 */
export function shouldKickTask(status: string, updatedAt: Date) {
  if (status === "pending") return true;
  if (status !== "running") return false;
  return updatedAt.getTime() < Date.now() - STALE_MS;
}

/**
 * 在当前请求返回后继续消费队列。
 * 线上部署在 Vercel，不会启动 worker/index.ts；after() 让这次函数在响应发出后把队列跑完。
 * 同一个进程里如果已经在消费，就复用那一次，避免轮询把同一条任务拉起多遍。
 */
let draining: Promise<void> | null = null;

function startDrain() {
  if (!draining) {
    draining = drainDueJobs().finally(() => {
      draining = null;
    });
  }
  return draining;
}

export function scheduleDrain() {
  try {
    after(() => startDrain());
  } catch (err) {
    console.error("[schedule-drain] after() unavailable", err);
    void startDrain();
  }
}
