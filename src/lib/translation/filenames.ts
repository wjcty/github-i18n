import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { openRouterChat } from "@/lib/openrouter";

const NON_ASCII = /[^\x00-\x7F]/;

function slugify(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

function fallbackSlug(segment: string): string {
  return `doc-${createHash("sha1").update(segment).digest("hex").slice(0, 8)}`;
}

function splitExt(segment: string): { stem: string; ext: string } {
  const i = segment.lastIndexOf(".");
  if (i <= 0) return { stem: segment, ext: "" };
  return { stem: segment.slice(0, i), ext: segment.slice(i) };
}

async function translateSegments(
  apiKey: string,
  model: string,
  segments: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (segments.length === 0) return result;

  try {
    const { content } = await openRouterChat(
      apiKey,
      [
        {
          role: "system",
          content:
            'You translate file and directory names into concise English slugs (lowercase kebab-case, ASCII only, no extension). Respond with JSON: {"names": {"<original>": "<english-slug>"}}.',
        },
        { role: "user", content: JSON.stringify(segments) },
      ],
      model,
      true,
    );
    const json = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
    const names = (JSON.parse(json) as { names?: Record<string, string> }).names ?? {};
    for (const s of segments) {
      const slug = slugify(names[s] ?? "");
      if (slug) result.set(s, slug);
    }
  } catch (e) {
    console.error("[filenames] segment translation failed:", e);
  }

  for (const s of segments) {
    if (!result.has(s)) result.set(s, slugify(s) || fallbackSlug(s));
  }
  return result;
}

/**
 * 基准语言文件名保持不变；所有目标语言的译文路径统一使用英文文件名/目录名。
 * 返回 sourcePath -> 英文相对路径（不含 translations/{lang}/ 前缀）。
 * 已有任务生成过的英文路径会被复用，保证增量翻译覆盖同一文件。
 */
export async function buildEnglishPathMap(input: {
  repositoryId: string;
  sourcePaths: string[];
  apiKey: string;
  model: string;
}): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pending: string[] = [];

  for (const p of input.sourcePaths) {
    if (NON_ASCII.test(p)) pending.push(p);
    else map.set(p, p);
  }
  if (pending.length === 0) return map;

  const previous = await prisma.taskPreview.findMany({
    where: { repositoryId: input.repositoryId, sourcePath: { in: pending } },
    orderBy: { task: { createdAt: "desc" } },
    select: { sourcePath: true, lang: true, translatedPath: true },
  });
  for (const row of previous) {
    if (map.has(row.sourcePath)) continue;
    const prefix = `translations/${row.lang}/`;
    if (!row.translatedPath.startsWith(prefix)) continue;
    const rel = row.translatedPath.slice(prefix.length);
    if (!NON_ASCII.test(rel)) map.set(row.sourcePath, rel);
  }

  const remaining = pending.filter((p) => !map.has(p));
  const segments = new Set<string>();
  for (const p of remaining) {
    for (const seg of p.split("/")) {
      if (!NON_ASCII.test(seg)) continue;
      segments.add(splitExt(seg).stem);
    }
  }
  const translated = await translateSegments(input.apiKey, input.model, [...segments]);

  const used = new Set(map.values());
  for (const p of remaining) {
    const rel = p
      .split("/")
      .map((seg) => {
        if (!NON_ASCII.test(seg)) return seg;
        const { stem, ext } = splitExt(seg);
        return `${translated.get(stem) ?? fallbackSlug(stem)}${ext}`;
      })
      .join("/");
    let candidate = rel;
    let n = 2;
    while (used.has(candidate)) {
      const { stem, ext } = splitExt(rel);
      candidate = `${stem}-${n++}${ext}`;
    }
    used.add(candidate);
    map.set(p, candidate);
  }

  return map;
}
