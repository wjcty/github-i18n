export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zh-CN", name: "Simplified Chinese", nativeName: "简体中文" },
  { code: "zh-TW", name: "Traditional Chinese", nativeName: "繁體中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
] as const;

export const LANGUAGE_CODES = new Set<string>(LANGUAGES.map((l) => l.code));

export const DEFAULT_MODEL_ID = "openai/gpt-4o-mini";

export const PLATFORM_MONTHLY_CHAR_LIMIT = Number(
  process.env.PLATFORM_MONTHLY_CHAR_LIMIT ?? "500000",
);

/** 后端 HTTP 端口（与 package.json dev/start 一致） */
export const DEFAULT_BACKEND_PORT = 3123;

export function appUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    `http://localhost:${DEFAULT_BACKEND_PORT}`
  );
}

export function githubAppSlug(): string {
  return process.env.GITHUB_APP_SLUG ?? "github-i18n";
}
