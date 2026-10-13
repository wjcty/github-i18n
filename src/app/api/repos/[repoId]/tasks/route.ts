import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRepoAccess } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { createTranslationTask } from "@/lib/tasks/create";
import { taskAcceptedResponse } from "@/lib/tasks/response";
import { taskProgress } from "@/lib/repos/mapper";

type Params = { params: Promise<{ repoId: string }> };

const createSchema = z.object({
  mode: z.enum(["full", "incremental"]),
  targetLanguages: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const repoId = (await params).repoId;
  const access = await requireRepoAccess(auth.user.id, repoId);
  if (access.error) return access.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Invalid JSON");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid task body");
  }

  try {
    const task = await createTranslationTask({
      repoId,
      userId: auth.user.id,
      mode: parsed.data.mode,
      trigger: "manual",
      targetLanguages: parsed.data.targetLanguages,
    });
    return NextResponse.json(taskAcceptedResponse(task), { status: 202 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create task";
    if (msg === "EMAIL_NOT_VERIFIED") {
      return apiError(
        403,
        "FORBIDDEN",
        "Verify your primary email on GitHub before creating translation tasks",
      );
    }
    if (msg.includes("key") || msg.includes("quota")) {
      return apiError(403, "FORBIDDEN", msg);
    }
    return apiError(400, "VALIDATION_ERROR", msg);
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const repoId = (await params).repoId;
  const access = await requireRepoAccess(auth.user.id, repoId);
  if (access.error) return access.error;

  const { page, pageSize, skip } = parsePagination(request.nextUrl.searchParams);
  const status = request.nextUrl.searchParams.get("status") ?? undefined;

  const where = {
    repositoryId: repoId,
    ...(status ? { status } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.translationTask.count({ where }),
    prisma.translationTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    items: items.map((t) => ({
      id: t.id,
      status: t.status,
      mode: t.mode,
      trigger: t.trigger,
      progress: taskProgress(t),
      prUrl: t.prUrl,
      skipReason: t.skipReason,
      errorMessage: t.errorMessage,
      retryCount: t.retryCount,
      createdAt: t.createdAt.toISOString(),
      finishedAt: t.finishedAt?.toISOString() ?? null,
    })),
    page,
    pageSize,
    total,
  });
}
