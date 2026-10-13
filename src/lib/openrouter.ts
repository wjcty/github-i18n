import { decrypt } from "@/lib/encryption";
import { appUrl, DEFAULT_MODEL_ID, PLATFORM_MONTHLY_CHAR_LIMIT } from "@/lib/constants";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function openRouterChat(
  apiKey: string,
  messages: ChatMessage[],
  model = DEFAULT_MODEL_ID,
  jsonMode = false,
): Promise<{ content: string; charsIn: number; charsOut: number }> {
  const charsIn = messages.reduce((n, m) => n + m.content.length, 0);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appUrl(),
      "X-OpenRouter-Title": "GitHub-i18n",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return { content, charsIn, charsOut: content.length };
}

export async function fetchOpenRouterModels(): Promise<
  { id: string; name: string; contextLength: number }[]
> {
  const key = process.env.OPENROUTER_PLATFORM_KEY;
  const fallback = [
    { id: DEFAULT_MODEL_ID, name: "GPT-4o Mini", contextLength: 128000 },
  ];
  if (!key) return fallback;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      data?: { id: string; name?: string; context_length?: number }[];
    };
    const models = (data.data ?? [])
      .filter(
        (m) =>
          m.id.includes("gpt") ||
          m.id.includes("claude") ||
          m.id.includes("llama") ||
          m.id.includes("gemini"),
      )
      .slice(0, 50)
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? 128000,
      }));
    return models.length ? models : fallback;
  } catch {
    return fallback;
  }
}

export async function resolveApiKeyForUser(
  userId: string,
): Promise<{ key: string; source: "BYOK" | "PLATFORM"; model: string }> {
  const settings = await (
    await import("@/lib/db")
  ).prisma.userSettings.findUnique({ where: { userId } });
  const billingMode = settings?.billingMode ?? "BYOK";
  const model = settings?.defaultModelId ?? DEFAULT_MODEL_ID;

  if (billingMode === "BYOK") {
    if (!settings?.openrouterKeyEnc) {
      throw new Error("OpenRouter API key not configured");
    }
    return { key: decrypt(settings.openrouterKeyEnc), source: "BYOK", model };
  }
  const platform = process.env.OPENROUTER_PLATFORM_KEY;
  if (!platform) throw new Error("Platform OpenRouter key not configured");
  const used = settings?.platformCharUsed ?? 0;
  if (used >= PLATFORM_MONTHLY_CHAR_LIMIT) {
    throw new Error("Platform translation quota exceeded");
  }
  return { key: platform, source: "PLATFORM", model };
}
