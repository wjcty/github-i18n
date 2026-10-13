import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { repoListItem } from "@/lib/repos/mapper";
import { getInstallationOctokit } from "@/lib/github/app";

const importSchema = z.object({
  installationId: z.number().int(),
  githubRepoId: z.number().int(),
  fullName: z.string().min(3),
});

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { page, pageSize, skip } = parsePagination(request.nextUrl.searchParams);

  const [total, repos] = await Promise.all([
    prisma.repository.count({ where: { userId: auth.user.id } }),
    prisma.repository.findMany({
      where: { userId: auth.user.id },
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const items = await Promise.all(
    repos.map(async (repo) => {
      const lastTask = await prisma.translationTask.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { createdAt: "desc" },
      });
      return repoListItem(repo, lastTask, lastTask?.prUrl ?? null);
    }),
  );

  return NextResponse.json({ items, page, pageSize, total });
}

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Invalid JSON body");
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid import payload", {
      issues: parsed.error.flatten(),
    });
  }

  const { installationId, githubRepoId, fullName } = parsed.data;
  const existing = await prisma.repository.findUnique({
    where: { userId_githubRepoId: { userId: auth.user.id, githubRepoId } },
  });
  if (existing) {
    return apiError(409, "CONFLICT", "Repository already imported");
  }

  const [owner, name] = fullName.split("/");
  if (!owner || !name) {
    return apiError(400, "VALIDATION_ERROR", "Invalid fullName");
  }

  let defaultBranch = "main";
  try {
    const octokit = await getInstallationOctokit(installationId);
    const { data } = await octokit.rest.repos.get({ owner, repo: name });
    defaultBranch = data.default_branch ?? "main";
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Cannot access repository via installation");
  }

  const inst = await prisma.installation.findUnique({
    where: { installationId },
  });

  const repo = await prisma.repository.create({
    data: {
      userId: auth.user.id,
      installationId,
      installationRecordId: inst?.id,
      githubRepoId,
      owner,
      name,
      fullName,
      defaultBranch,
    },
  });

  return NextResponse.json(
    {
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch,
      baseLanguage: repo.baseLanguage,
      targetLanguages: [],
      autoSyncEnabled: repo.autoSyncEnabled,
      lastTranslatedBaseCommit: repo.lastTranslatedBaseCommit,
      translationStatus: "not_started",
    },
    { status: 201 },
  );
}
