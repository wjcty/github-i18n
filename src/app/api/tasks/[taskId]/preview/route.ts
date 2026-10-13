import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireTaskAccess } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const taskId = (await params).taskId;
  const access = await requireTaskAccess(auth.user.id, taskId);
  if (access.error) return access.error;

  const lang = request.nextUrl.searchParams.get("lang");
  const path = request.nextUrl.searchParams.get("path");
  if (!lang || !path) {
    return apiError(400, "VALIDATION_ERROR", "lang and path query params are required");
  }

  if (!["completed", "skipped"].includes(access.task.status)) {
    return apiError(404, "NOT_FOUND", "Preview not available for this task status");
  }

  const preview = await prisma.taskPreview.findUnique({
    where: {
      taskId_lang_sourcePath: { taskId, lang, sourcePath: path },
    },
  });

  if (!preview) {
    return apiError(404, "NOT_FOUND", "Preview file not found");
  }

  return NextResponse.json({
    lang: preview.lang,
    sourcePath: preview.sourcePath,
    translatedPath: preview.translatedPath,
    content: preview.content,
    encoding: "utf-8",
  });
}
