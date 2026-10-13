import { Webhooks } from "@octokit/webhooks";
import { prisma } from "@/lib/db";
import { createTranslationTask } from "@/lib/tasks/create";
import {
  installationAccountLogin,
  installationAccountType,
} from "@/lib/github/installation-account";

export const runtime = "nodejs";

function getWebhooks() {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) throw new Error("GITHUB_APP_WEBHOOK_SECRET is not set");
  return new Webhooks({ secret });
}

export async function POST(request: Request) {
  const body = await request.text();
  const id = request.headers.get("x-github-delivery") ?? "";
  const name = request.headers.get("x-github-event") ?? "";
  const sig = request.headers.get("x-hub-signature-256") ?? "";

  if (!id || !name || !sig) {
    return new Response("Missing webhook headers", { status: 400 });
  }

  try {
    const webhooks = getWebhooks();
    await webhooks.verify(body, sig);
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    await prisma.webhookDelivery.create({
      data: { deliveryId: id, event: name, repoFullName: null },
    });
  } catch {
    return new Response("OK", { status: 200 });
  }

  const payload = JSON.parse(body) as Record<string, unknown>;

  if (name === "push") {
    const ref = payload.ref as string | undefined;
    const repo = payload.repository as { full_name?: string; default_branch?: string } | undefined;
    const installation = payload.installation as { id?: number } | undefined;
    const after = payload.after as string | undefined;

    if (!repo?.full_name || !installation?.id || !after) {
      return new Response("OK", { status: 200 });
    }

    const defaultBranch = repo.default_branch ?? "main";
    if (ref !== `refs/heads/${defaultBranch}`) {
      return new Response("OK", { status: 200 });
    }
    if (ref.startsWith("refs/heads/github-i18n/")) {
      return new Response("OK", { status: 200 });
    }

    const platformRepo = await prisma.repository.findFirst({
      where: {
        installationId: installation.id,
        fullName: repo.full_name,
        autoSyncEnabled: true,
      },
    });

    if (!platformRepo) {
      return new Response("OK", { status: 200 });
    }

    const mode =
      platformRepo.lastTranslatedBaseCommit ? "incremental" : "full";

    try {
      await createTranslationTask({
        repoId: platformRepo.id,
        userId: platformRepo.userId,
        mode,
        trigger: "webhook",
        webhookDeliveryId: id,
        afterCommit: after,
      });
    } catch {
      /* ignore enqueue errors for webhook */
    }
  }

  if (name === "installation" || name === "installation_repositories") {
    const installation = payload.installation as {
      id?: number;
      account?: { login?: string; type?: string };
      repository_selection?: string;
    };
    if (installation?.id) {
      await prisma.installation.upsert({
        where: { installationId: installation.id },
        create: {
          installationId: installation.id,
          accountLogin: installationAccountLogin(installation.account),
          accountType: installationAccountType(installation.account),
          repositorySelection: installation.repository_selection ?? null,
        },
        update: {
          accountLogin: installationAccountLogin(installation.account),
          accountType: installationAccountType(installation.account),
          repositorySelection: installation.repository_selection ?? null,
        },
      });
    }
  }

  return new Response("OK", { status: 200 });
}
