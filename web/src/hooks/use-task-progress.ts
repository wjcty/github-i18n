"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi } from "@/lib/api";
import type { TaskDetail, TaskProgress } from "@/lib/api/types";

export function useTaskProgress(taskId: string, initial?: TaskDetail) {
  const [task, setTask] = useState<TaskDetail | undefined>(initial);
  const [progress, setProgress] = useState<TaskProgress | undefined>(
    initial?.progress,
  );
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    const data = await tasksApi.get(taskId);
    setTask(data);
    setProgress(data.progress);
    return data;
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await tasksApi.get(taskId);
        if (cancelled) return;
        setTask(data);
        setProgress(data.progress);
        if (data.status === "pending" || data.status === "running") {
          setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 3000);
      }
    }

    void poll();

    const es = new EventSource(`/api/tasks/${taskId}/events`);
    esRef.current = es;

    es.addEventListener("progress", (ev) => {
      try {
        setProgress(JSON.parse((ev as MessageEvent).data) as TaskProgress);
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("status", () => void refresh());
    es.addEventListener("completed", () => void refresh());
    es.addEventListener("failed", () => void refresh());
    es.addEventListener("skipped", () => void refresh());

    es.onerror = () => {
      es.close();
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [taskId, refresh]);

  return { task, progress, refresh };
}
