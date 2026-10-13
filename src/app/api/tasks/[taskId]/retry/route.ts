import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireTaskAccess } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { enqueueTaskJob } from "@/lib/jobs";
import { taskAcceptedResponse } from "@/lib/tasks/response";

type Params = { params: Promise<{ taskId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const taskId = (await params).taskId;
  const access = await requireTaskAccess(auth.user.id, taskId);
  if (access.error) return access.error;

  const task = access.task;
  if (task.status !== "failed") {
    return apiError(403, "FORBIDDEN", "Only failed tasks can be retried");
  }
  if (task.retryCount >= 3) {
    return apiError(403, "FORBIDDEN", "Maximum retry count reached");
  }

  const updated = await prisma.translationTask.update({
    where: { id: taskId },
    data: {
      status: "pending",
      errorMessage: null,
      skipReason: null,
      finishedAt: null,
      retryCount: { increment: 1 },
      doneFiles: 0,
      totalFiles: 0,
      currentFile: null,
    },
  });

  await enqueueTaskJob(taskId);

  return NextResponse.json(taskAcceptedResponse(updated), { status: 202 });
}
