import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRepoAccess } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { LANGUAGE_CODES } from "@/lib/constants";
import { repoDetailResponse } from "@/lib/repos/detail";
import type { ScopeConfig } from "@/types/api";

type Params = { params: Promise<{ repoId: string }> };

const patchSchema = z.object({
  baseLanguage: z.string().optional(),
  targetLanguages: z.array(z.string()).optional(),
  autoTranslate: z.boolean().optional(),
  scopeConfig: z
    .object({
      mode: z.literal("paths"),
      includePaths: z.array(z.string()),
      excludePaths: z.array(z.string()),
    })
    .optional(),
  ignoreFileContent: z.string().optional(),
});

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const repoId = (await params).repoId;
  const access = await requireRepoAccess(auth.user.id, repoId);
  if (access.error) return access.error;

  const recentTasks = await prisma.translationTask.findMany({
    where: { repositoryId: repoId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(repoDetailResponse(access.repo, recentTasks));
}

export async function PATCH(request: NextRequest, { params }: Params) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid patch body");
  }

  const data = parsed.data;
  if (data.baseLanguage && !LANGUAGE_CODES.has(data.baseLanguage)) {
    return apiError(400, "VALIDATION_ERROR", "Invalid baseLanguage");
  }
  if (data.targetLanguages) {
    for (const lang of data.targetLanguages) {
      if (!LANGUAGE_CODES.has(lang)) {
        return apiError(400, "VALIDATION_ERROR", `Invalid language: ${lang}`);
      }
    }
  }

  const baseLanguage = data.baseLanguage ?? access.repo.baseLanguage;
  const targets =
    data.targetLanguages ?? (access.repo.targetLanguages as string[]);
  if (Array.isArray(targets)) {
    for (const lang of targets) {
      if (lang === baseLanguage) {
        return apiError(
          400,
          "VALIDATION_ERROR",
          "targetLanguages cannot include baseLanguage",
        );
      }
    }
  }

  const updated = await prisma.repository.update({
    where: { id: repoId },
    data: {
      baseLanguage: data.baseLanguage,
      targetLanguages: data.targetLanguages,
      autoTranslate: data.autoTranslate,
      scopeConfig: data.scopeConfig as ScopeConfig | undefined,
      ignoreFileContent: data.ignoreFileContent,
    },
  });

  const recentTasks = await prisma.translationTask.findMany({
    where: { repositoryId: repoId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(repoDetailResponse(updated, recentTasks));
}
