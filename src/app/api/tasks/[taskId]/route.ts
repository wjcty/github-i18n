import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireTaskAccess } from "@/lib/auth-session";
import { taskDetailResponse } from "@/lib/tasks/response";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const taskId = (await params).taskId;
  const access = await requireTaskAccess(auth.user.id, taskId);
  if (access.error) return access.error;

  return NextResponse.json(
    taskDetailResponse(access.task, access.task.repository),
  );
}
