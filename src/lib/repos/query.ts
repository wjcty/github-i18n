import type { Prisma, Repository, TranslationTask } from "@prisma/client";
import { LANGUAGES } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { repoListItem } from "@/lib/repos/mapper";

export function languageFilter(lang: string): Prisma.RepositoryWhereInput {
  const q = lang.trim();
  if (!q) return {};
  if (q === "未配置" || q === "未设置") {
    return { targetLanguages: { equals: [] } };
  }
  const needle = q.toLowerCase();
  const codes = LANGUAGES.filter((l) =>
    [l.code, l.name, l.nativeName, l.zhName].some((s) =>
      s.toLowerCase().includes(needle),
    ),
  ).map((l) => l.code);
  if (codes.length === 0) {
    return { targetLanguages: { array_contains: q } };
  }
  return {
    OR: codes.map((code) => ({
      targetLanguages: { array_contains: code },
    })),
  };
}

export async function attachLastTasks(repos: Repository[]) {
  if (repos.length === 0) return [];
  const latest = await prisma.translationTask.groupBy({
    by: ["repositoryId"],
    where: { repositoryId: { in: repos.map((r) => r.id) } },
    _max: { createdAt: true },
  });
  const lastTasks =
    latest.length === 0
      ? []
      : await prisma.translationTask.findMany({
          where: {
            OR: latest.map((row) => ({
              repositoryId: row.repositoryId,
              createdAt: row._max.createdAt ?? undefined,
            })),
          },
        });
  const lastByRepo = new Map<string, TranslationTask>();
  for (const task of lastTasks) {
    if (!lastByRepo.has(task.repositoryId)) {
      lastByRepo.set(task.repositoryId, task);
    }
  }
  return repos.map((repo) => {
    const last = lastByRepo.get(repo.id) ?? null;
    return repoListItem(repo, last, last?.prUrl ?? null);
  });
}
