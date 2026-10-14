import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DEFAULT_MODEL_ID } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { fetchOpenRouterModels } from "@/lib/openrouter";

async function resolveModelsApiKey(): Promise<string | null> {
  const platform =
    process.env.OPENROUTER_PLATFORM_KEY ||
    process.env.PLATFORM_OPENROUTER_API_KEY ||
    null;
  if (platform) return platform;

  const session = await auth();
  if (!session?.user?.id) return null;

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { openrouterKeyEnc: true },
  });
  if (!settings?.openrouterKeyEnc) return null;

  try {
    return decrypt(settings.openrouterKeyEnc);
  } catch {
    return null;
  }
}

export async function GET() {
  const apiKey = await resolveModelsApiKey();
  const models = await fetchOpenRouterModels(apiKey);
  return NextResponse.json({
    models,
    defaultModelId: models[0]?.id ?? DEFAULT_MODEL_ID,
  });
}
