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
import { isAllowedOpenRouterModelId } from "@/lib/openrouter";

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
    billingMode: settings?.billingMode ?? "PLATFORM",
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

  let existing = await prisma.userSettings.findUnique({
    where: { userId: auth.user.id },
  });
  if (!existing) {
    existing = await prisma.userSettings.create({
      data: { userId: auth.user.id },
    });
  }

  if (parsed.data.defaultModelId) {
    const allowed = await isAllowedOpenRouterModelId(parsed.data.defaultModelId, {
      allowExistingId: existing.defaultModelId,
    });
    if (!allowed) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        `Unsupported model: ${parsed.data.defaultModelId}. Choose from OpenRouter text rankings top 20.`,
      );
    }
  }

  let openrouterKeyEnc: string | null | undefined = undefined;
  if (parsed.data.openrouterApiKey !== undefined) {
    if (parsed.data.openrouterApiKey === "") {
      openrouterKeyEnc = null;
    } else {
      const key = parsed.data.openrouterApiKey.trim();
      if (!key.startsWith("sk-or-")) {
        return apiError(
          400,
          "VALIDATION_ERROR",
          "Invalid OpenRouter API key. It should start with sk-or-.",
        );
      }
      try {
        openrouterKeyEnc = encrypt(key);
      } catch (e) {
        return apiError(
          500,
          "INTERNAL_ERROR",
          e instanceof Error ? e.message : "Failed to save settings",
        );
      }
    }
  }

  const nextBillingMode = parsed.data.billingMode ?? existing.billingMode;
  const nextKeyEnc =
    openrouterKeyEnc !== undefined ? openrouterKeyEnc : existing.openrouterKeyEnc;

  // BYOK 保存时必须有用户自己的 Key（显式清空 Key 除外，清空后需重新填写才能翻译）
  const explicitlyClearingKey = parsed.data.openrouterApiKey === "";
  if (nextBillingMode === "BYOK" && !nextKeyEnc && !explicitlyClearingKey) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      "BYOK mode requires your own OpenRouter API key. Get one at https://openrouter.ai/keys",
    );
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
