import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { encrypt, decrypt, maskSecret } from "@/lib/encryption";
import {
  DEFAULT_MODEL_ID,
  LANGUAGE_CODES,
  PLATFORM_MONTHLY_CHAR_LIMIT,
} from "@/lib/constants";

function settingsResponse(
  settings: {
    billingMode: string;
    defaultModelId: string;
    defaultTargetLangs: unknown;
    openrouterKeyEnc: string | null;
    platformCharUsed: number;
    platformCharResetAt: Date;
  } | null,
) {
  const langs = Array.isArray(settings?.defaultTargetLangs)
    ? (settings!.defaultTargetLangs as string[])
    : [];
  let mask: string | null = null;
  let configured = false;
  if (settings?.openrouterKeyEnc) {
    try {
      mask = maskSecret(decrypt(settings.openrouterKeyEnc));
      configured = true;
    } catch {
      configured = false;
    }
  }

  const resetAt = settings?.platformCharResetAt ?? new Date();
  const nextReset = new Date(resetAt);
  nextReset.setMonth(nextReset.getMonth() + 1);

  return {
    billingMode: settings?.billingMode ?? "BYOK",
    defaultModelId: settings?.defaultModelId ?? DEFAULT_MODEL_ID,
    defaultTargetLangs: langs,
    openrouterKeyConfigured: configured,
    openrouterKeyMask: mask,
    platformQuota: {
      monthlyCharLimit: PLATFORM_MONTHLY_CHAR_LIMIT,
      monthlyCharUsed: settings?.platformCharUsed ?? 0,
      resetAt: nextReset.toISOString(),
    },
  };
}

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const settings = await prisma.userSettings.findUnique({
    where: { userId: auth.user.id },
  });

  return NextResponse.json(settingsResponse(settings));
}

const putSchema = z.object({
  billingMode: z.enum(["BYOK", "PLATFORM"]).optional(),
  openrouterApiKey: z.string().optional(),
  defaultModelId: z.string().optional(),
  defaultTargetLangs: z.array(z.string()).optional(),
});

export async function PUT(request: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Invalid JSON");
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid settings body");
  }

  if (parsed.data.defaultTargetLangs) {
    for (const lang of parsed.data.defaultTargetLangs) {
      if (!LANGUAGE_CODES.has(lang)) {
        return apiError(400, "VALIDATION_ERROR", `Invalid language: ${lang}`);
      }
    }
  }

  const existing = await prisma.userSettings.findUnique({
    where: { userId: auth.user.id },
  });
  if (!existing) {
    await prisma.userSettings.create({ data: { userId: auth.user.id } });
  }

  let openrouterKeyEnc: string | null | undefined = undefined;
  if (parsed.data.openrouterApiKey !== undefined) {
    if (parsed.data.openrouterApiKey === "") {
      openrouterKeyEnc = null;
    } else {
      try {
        openrouterKeyEnc = encrypt(parsed.data.openrouterApiKey);
      } catch (e) {
        return apiError(
          500,
          "INTERNAL_ERROR",
          e instanceof Error ? e.message : "Failed to save settings",
        );
      }
    }
  }

  const updated = await prisma.userSettings.update({
    where: { userId: auth.user.id },
    data: {
      billingMode: parsed.data.billingMode,
      defaultModelId: parsed.data.defaultModelId,
      defaultTargetLangs: parsed.data.defaultTargetLangs,
      ...(openrouterKeyEnc !== undefined ? { openrouterKeyEnc } : {}),
    },
  });

  return NextResponse.json(settingsResponse(updated));
}
