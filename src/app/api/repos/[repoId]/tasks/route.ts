import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireSession, requireRepoAccess } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { createdAtFuzzySql, parseFuzzyDateRange } from "@/lib/fuzzy-datetime";
import { createTranslationTask } from "@/lib/tasks/create";
import { taskAcceptedResponse } from "@/lib/tasks/response";
import { taskProgress } from "@/lib/repos/mapper";
import { scheduleDrain, shouldKickTask } from "@/lib/schedule-drain";

type Params = { params: Promise<{ repoId: string }> };

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const status = request.nextUrl.searchParams.get("status")?.trim() || undefined;
  const mode = request.nextUrl.searchParams.get("mode")?.trim() || undefined;
  const createdAtQ = request.nextUrl.searchParams.get("createdAt")?.trim() || "";

  const where: Prisma.TranslationTaskWhereInput = {
    repositoryId: repoId,
    ...(status ? { status } : {}),
    ...(mode ? { mode } : {}),
  };

  const createdRange = createdAtQ ? parseFuzzyDateRange(createdAtQ) : undefined;
  if (createdRange) {
    where.createdAt = createdRange;
  } else if (createdAtQ) {
    const matched = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM TranslationTask
      WHERE repositoryId = ${repoId}
        AND ${createdAtFuzzySql(createdAtQ)}
    `;
    where.id = { in: matched.length ? matched.map((r) => r.id) : ["__none__"] };
  }

  const [total, items] = await Promise.all([
    prisma.translationTask.count({ where }),
    prisma.translationTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  if (items.some((t) => shouldKickTask(t.status, t.updatedAt))) {
    scheduleDrain();
  }

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
