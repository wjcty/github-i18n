import { auth } from "@/auth";
import { apiError } from "@/lib/api-error";
import { prisma } from "@/lib/db";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: apiError(401, "UNAUTHORIZED", "Not authenticated") };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { settings: true },
  });
  if (!user) {
    return { error: apiError(401, "UNAUTHORIZED", "User not found") };
  }
  return { session, user };
}

export async function requireRepoAccess(userId: string, repoId: string) {
  const repo = await prisma.repository.findFirst({
    where: { id: repoId, userId },
  });
  if (!repo) {
    return { error: apiError(404, "NOT_FOUND", "Repository not found") };
  }
  return { repo };
}

export async function requireTaskAccess(userId: string, taskId: string) {
  const task = await prisma.translationTask.findFirst({
    where: { id: taskId, repository: { userId } },
    include: { repository: true },
  });
  if (!task) {
    return { error: apiError(404, "NOT_FOUND", "Task not found") };
  }
  return { task };
}
