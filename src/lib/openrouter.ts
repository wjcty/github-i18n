import { decrypt } from "@/lib/encryption";
import { appUrl, DEFAULT_MODEL_ID, PLATFORM_MONTHLY_CHAR_LIMIT } from "@/lib/constants";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterModelMeta = {
  id: string;
  name: string;
  contextLength: number;
};

/** OpenRouter rankings 文本模型周榜可选数量（与 openrouter.ai/rankings 对齐） */
export const TOP_TEXT_MODELS_LIMIT = 20;

const REGION_FALLBACK_MODELS = [
  "deepseek/deepseek-chat",
  "qwen/qwen-2.5-7b-instruct",
  "meta-llama/llama-3.1-8b-instruct",
];

const FALLBACK_MODELS: OpenRouterModelMeta[] = [
  { id: DEFAULT_MODEL_ID, name: "GPT-4o Mini", contextLength: 128000 },
];

type CatalogModel = {
  id: string;
  name?: string;
  canonical_slug?: string;
  context_length?: number;
  architecture?: { output_modalities?: string[] };
};

type RankingsRow = {
  date: string;
  model_permaslug: string;
  total_tokens: string;
};

function platformApiKey(): string | undefined {
  return (
    process.env.OPENROUTER_PLATFORM_KEY ||
    process.env.PLATFORM_OPENROUTER_API_KEY ||
    undefined
  );
}

function fetchInit(apiKey: string): RequestInit {
  return {
    headers: { Authorization: `Bearer ${apiKey}` },
    // Next.js Data Cache；Worker / Node fetch 会忽略未知字段
    next: { revalidate: 3600 },
  } as RequestInit;
}

function isTextOutputModel(model: CatalogModel): boolean {
  const outs = model.architecture?.output_modalities;
  if (!outs?.length) return true;
  return outs.includes("text");
}

/**
 * 将 rankings 的 model_permaslug（常带日期/变体）映射到可调用的 chat model id。
 */
function resolveChatModel(
  permaslug: string,
  catalog: CatalogModel[],
): CatalogModel | null {
  if (!permaslug || permaslug === "other") return null;

  const colon = permaslug.lastIndexOf(":");
  const variant = colon >= 0 ? permaslug.slice(colon + 1) : null;
  const base = colon >= 0 ? permaslug.slice(0, colon) : permaslug;

  let candidates = catalog.filter(
    (m) =>
      m.canonical_slug === base ||
      m.canonical_slug === permaslug ||
      m.id === permaslug ||
      m.id === base,
  );
  if (!candidates.length) return null;

  candidates = candidates.filter(
    (m) => !m.id.includes(":batch") && isTextOutputModel(m),
  );
  if (!candidates.length) return null;

  if (variant) {
    const withVariant = candidates.filter((m) => m.id.endsWith(`:${variant}`));
    if (withVariant.length) candidates = withVariant;
  } else {
    const plain = candidates.filter((m) => !m.id.includes(":"));
    if (plain.length) candidates = plain;
  }

  return candidates[0] ?? null;
}

async function fetchModelsCatalog(apiKey: string): Promise<CatalogModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", fetchInit(apiKey));
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: CatalogModel[] };
  return data.data ?? [];
}

/**
 * 拉取与 https://openrouter.ai/rankings 文本周榜一致的 permaslug 列表（按用量降序）。
 * 数据来源：OpenRouter Data API `/api/v1/datasets/rankings-daily`。
 */
async function fetchTopTextPermaslugs(apiKey: string): Promise<string[]> {
  const res = await fetch(
    "https://openrouter.ai/api/v1/datasets/rankings-daily?period=week&modality=text",
    fetchInit(apiKey),
  );
  if (!res.ok) return [];

  const payload = (await res.json()) as { data?: RankingsRow[] };
  const rows = (payload.data ?? []).filter((r) => r.model_permaslug !== "other");
  if (!rows.length) return [];

  const latestDate = rows.reduce(
    (max, r) => (r.date > max ? r.date : max),
    rows[0]!.date,
  );
  const week = rows
    .filter((r) => r.date === latestDate)
    .sort((a, b) => {
      const ta = BigInt(a.total_tokens);
      const tb = BigInt(b.total_tokens);
      if (tb > ta) return 1;
      if (tb < ta) return -1;
      return a.model_permaslug.localeCompare(b.model_permaslug);
    });

  return week.map((r) => r.model_permaslug);
}

export async function openRouterChat(
  apiKey: string,
  messages: ChatMessage[],
  model = DEFAULT_MODEL_ID,
  jsonMode = false,
): Promise<{ content: string; charsIn: number; charsOut: number }> {
  const charsIn = messages.reduce((n, m) => n + m.content.length, 0);
  const models = [model, ...REGION_FALLBACK_MODELS.filter((id) => id !== model)];
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
      models,
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

/**
 * OpenRouter 文本模型周榜 Top N（默认 20）。
 * @param apiKey 优先使用传入的 Key（BYOK）；否则用平台 Key。
 */
export async function fetchOpenRouterModels(
  apiKey?: string | null,
): Promise<OpenRouterModelMeta[]> {
  const key = apiKey || platformApiKey();
  if (!key) return FALLBACK_MODELS;

  try {
    const [permaslugs, catalog] = await Promise.all([
      fetchTopTextPermaslugs(key),
      fetchModelsCatalog(key),
    ]);
    if (!permaslugs.length || !catalog.length) return FALLBACK_MODELS;

    const models: OpenRouterModelMeta[] = [];
    const seen = new Set<string>();
    for (const slug of permaslugs) {
      if (models.length >= TOP_TEXT_MODELS_LIMIT) break;
      const hit = resolveChatModel(slug, catalog);
      if (!hit || seen.has(hit.id)) continue;
      seen.add(hit.id);
      models.push({
        id: hit.id,
        name: hit.name ?? hit.id,
        contextLength: hit.context_length ?? 128000,
      });
    }
    return models.length ? models : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

/** 是否属于当前允许选择的排行榜文本模型（或仍为用户已保存的旧值）。 */
export async function isAllowedOpenRouterModelId(
  modelId: string,
  options?: { apiKey?: string | null; allowExistingId?: string | null },
): Promise<boolean> {
  if (options?.allowExistingId && options.allowExistingId === modelId) {
    return true;
  }
  const models = await fetchOpenRouterModels(options?.apiKey);
  return models.some((m) => m.id === modelId);
}

export async function resolveApiKeyForUser(
  userId: string,
): Promise<{ key: string; source: "BYOK" | "PLATFORM"; model: string }> {
  const settings = await (
    await import("@/lib/db")
  ).prisma.userSettings.findUnique({ where: { userId } });
  const billingMode = settings?.billingMode ?? "BYOK";
  const model = settings?.defaultModelId ?? DEFAULT_MODEL_ID;

  // BYOK：只用用户设置里保存的 Key，绝不回退到 .env 平台 Key
  if (billingMode === "BYOK") {
    if (!settings?.openrouterKeyEnc) {
      throw new Error(
        "OpenRouter API key not configured. Add your own key in Settings (BYOK), or get one at https://openrouter.ai/keys",
      );
    }
    return { key: decrypt(settings.openrouterKeyEnc), source: "BYOK", model };
  }

  // PLATFORM：使用部署环境中的平台 Key + 月度字符配额
  const platform = platformApiKey();
  if (!platform) throw new Error("Platform OpenRouter key not configured");
  const used = settings?.platformCharUsed ?? 0;
  if (used >= PLATFORM_MONTHLY_CHAR_LIMIT) {
    throw new Error("Platform translation quota exceeded");
  }
  return { key: platform, source: "PLATFORM", model };
}
