import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-session";
import { getUserOctokit } from "@/lib/github/user-token";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";

type Params = { params: Promise<{ installationId: string }> };

type InstallationRepo = {
  id: number;
  full_name: string;
  default_branch?: string;
  private: boolean;
};

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const installationId = Number((await params).installationId);
  if (!Number.isFinite(installationId)) {
    return apiError(400, "VALIDATION_ERROR", "Invalid installationId");
  }

  const octokit = await getUserOctokit(auth.user.id);
  if (!octokit) {
    return apiError(403, "FORBIDDEN", "GitHub token not available");
  }

  const sp = request.nextUrl.searchParams;
  const all = sp.get("all") === "true";
  const { page, pageSize, skip } = parsePagination(sp);
  const q = sp.get("q")?.toLowerCase() ?? "";

  let repos = (await octokit.paginate(
    "GET /user/installations/{installation_id}/repositories",
    { installation_id: installationId, per_page: 100 },
  )) as unknown as InstallationRepo[];
  if (q) repos = repos.filter((r) => r.full_name?.toLowerCase().includes(q));

  const imported = await prisma.repository.findMany({
    where: { userId: auth.user.id, githubRepoId: { in: repos.map((r) => r.id) } },
    select: { id: true, githubRepoId: true },
  });
  const importedMap = new Map(imported.map((r) => [r.githubRepoId, r.id]));

  const total = repos.length;
  const slice = all ? repos : repos.slice(skip, skip + pageSize);

  return NextResponse.json({
    items: slice.map((r) => ({
      githubRepoId: r.id,
      fullName: r.full_name,
      defaultBranch: r.default_branch ?? "main",
      private: r.private,
      alreadyImported: importedMap.has(r.id),
      platformRepoId: importedMap.get(r.id) ?? null,
    })),
    page: all ? 1 : page,
    pageSize: all ? total : pageSize,
    total,
  });
}
