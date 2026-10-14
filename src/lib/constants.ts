export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", zhName: "英语" },
  {
    code: "zh-CN",
    name: "Simplified Chinese",
    nativeName: "简体中文",
    zhName: "简体中文",
  },
  {
    code: "zh-TW",
    name: "Traditional Chinese",
    nativeName: "繁體中文",
    zhName: "繁体中文",
  },
  { code: "ja", name: "Japanese", nativeName: "日本語", zhName: "日语" },
  { code: "ko", name: "Korean", nativeName: "한국어", zhName: "韩语" },
  { code: "es", name: "Spanish", nativeName: "Español", zhName: "西班牙语" },
  { code: "fr", name: "French", nativeName: "Français", zhName: "法语" },
  { code: "de", name: "German", nativeName: "Deutsch", zhName: "德语" },
  {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    zhName: "葡萄牙语",
  },
  { code: "ru", name: "Russian", nativeName: "Русский", zhName: "俄语" },
  { code: "ar", name: "Arabic", nativeName: "العربية", zhName: "阿拉伯语" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", zhName: "印地语" },
  { code: "it", name: "Italian", nativeName: "Italiano", zhName: "意大利语" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", zhName: "荷兰语" },
  { code: "pl", name: "Polish", nativeName: "Polski", zhName: "波兰语" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", zhName: "土耳其语" },
  {
    code: "vi",
    name: "Vietnamese",
    nativeName: "Tiếng Việt",
    zhName: "越南语",
  },
  { code: "th", name: "Thai", nativeName: "ไทย", zhName: "泰语" },
  {
    code: "id",
    name: "Indonesian",
    nativeName: "Bahasa Indonesia",
    zhName: "印尼语",
  },
  {
    code: "ms",
    name: "Malay",
    nativeName: "Bahasa Melayu",
    zhName: "马来语",
  },
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
