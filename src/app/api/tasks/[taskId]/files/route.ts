import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireTaskAccess } from "@/lib/auth-session";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ taskId: string }> };

/** 列出任务已翻译的文件（供任务详情展示与预览下拉选择）。 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const taskId = (await params).taskId;
  const access = await requireTaskAccess(auth.user.id, taskId);
  if (access.error) return access.error;

  const previews = await prisma.taskPreview.findMany({
    where: { taskId },
    select: { lang: true, sourcePath: true, translatedPath: true },
    orderBy: { sourcePath: "asc" },
  });

  const bySource = new Map<
    string,
    { sourcePath: string; items: { lang: string; translatedPath: string }[] }
  >();
  for (const p of previews) {
    const entry = bySource.get(p.sourcePath) ?? {
      sourcePath: p.sourcePath,
      items: [],
    };
    entry.items.push({ lang: p.lang, translatedPath: p.translatedPath });
    bySource.set(p.sourcePath, entry);
  }

  const files = [...bySource.values()];
  return NextResponse.json({
    files,
    count: files.length,
    finishedAt: access.task.finishedAt?.toISOString() ?? null,
  });
}
