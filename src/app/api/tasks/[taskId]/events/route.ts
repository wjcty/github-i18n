import { requireSession, requireTaskAccess } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { taskProgress } from "@/lib/repos/mapper";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const taskId = (await params).taskId;
  const access = await requireTaskAccess(auth.user.id, taskId);
  if (access.error) return access.error;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      let lastStatus = "";
      let lastDone = -1;

      for (let i = 0; i < 600; i++) {
        const task = await prisma.translationTask.findUnique({
          where: { id: taskId },
        });
        if (!task) break;

        if (task.status !== lastStatus) {
          send("status", { status: task.status });
          lastStatus = task.status;
        }

        if (task.doneFiles !== lastDone || task.currentFile) {
          send("progress", taskProgress(task));
          lastDone = task.doneFiles;
        }

        if (task.status === "completed") {
          send("completed", {
            status: "completed",
            prUrl: task.prUrl,
            prNumber: task.prNumber,
          });
          break;
        }
        if (task.status === "failed") {
          send("failed", {
            status: "failed",
            errorMessage: task.errorMessage,
          });
          break;
        }
        if (task.status === "skipped") {
          send("skipped", {
            status: "skipped",
            skipReason: task.skipReason,
          });
          break;
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
