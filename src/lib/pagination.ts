export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const rawSize = Number(searchParams.get("pageSize") ?? "20") || 20;
  const pageSize = Math.min(50, Math.max(1, rawSize));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}
