import { Prisma } from "@prisma/client";

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** 将用户输入规范成可与 MySQL CAST(datetime AS CHAR) 模糊匹配的片段 */
export function normalizeDateQuery(raw: string): string {
  return raw.trim().replace(/\//g, "-").replace(/\s+/g, " ");
}

export function parseFuzzyDateRange(
  raw: string,
): { gte: Date; lt: Date } | undefined {
  const q = normalizeDateQuery(raw);
  if (!q) return undefined;

  const day = q.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) {
    const start = new Date(`${day[1]}-${day[2]}-${day[3]}T00:00:00+08:00`);
    if (Number.isNaN(start.getTime())) return undefined;
    return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }

  const month = q.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    const start = new Date(`${month[1]}-${month[2]}-01T00:00:00+08:00`);
    if (Number.isNaN(start.getTime())) return undefined;
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { gte: start, lt: end };
  }

  if (/^\d{4}$/.test(q)) {
    const year = Number(q);
    return {
      gte: new Date(`${year}-01-01T00:00:00+08:00`),
      lt: new Date(`${year + 1}-01-01T00:00:00+08:00`),
    };
  }

  return undefined;
}

export function createdAtFuzzySql(query: string): Prisma.Sql {
  const like = `%${escapeLike(normalizeDateQuery(query))}%`;
  return Prisma.sql`CAST(createdAt AS CHAR) LIKE ${like}`;
}
