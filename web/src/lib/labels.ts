import type {
  LanguageMeta,
  TaskMode,
  TaskStatus,
  TranslationStatus,
} from "./api/types";

/** 中-英对译标签，如：法语（French）、简体中文(zh-CN) */
export function formatLanguageLabel(
  lang: Pick<LanguageMeta, "code" | "name" | "zhName">,
): string {
  if (lang.code.startsWith("zh")) {
    return `${lang.zhName}(${lang.code})`;
  }
  return `${lang.zhName}（${lang.name}）`;
}

export function formatLanguageCodeLabel(
  code: string,
  languages: LanguageMeta[],
): string {
  const lang = languages.find((l) => l.code === code);
  return lang ? formatLanguageLabel(lang) : code;
}

/** 截断语言列表：超出 limit 时末尾加省略号 */
export function formatLanguageList(
  codes: string[],
  languages: LanguageMeta[],
  limit: number,
  separator = " · ",
): string {
  const labels = codes.map((code) => formatLanguageCodeLabel(code, languages));
  if (labels.length <= limit) return labels.join(separator);
  return `${labels.slice(0, limit).join(separator)}${separator}…`;
}

export const translationStatusLabel: Record<TranslationStatus, string> = {
  not_started: "未开始",
  in_progress: "翻译中",
  synced: "已同步",
  error: "异常",
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  pending: "排队中",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  skipped: "已跳过",
};

export const taskModeLabel: Record<TaskMode, string> = {
  full: "全量翻译",
  incremental: "增量翻译",
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const AUTH_NETWORK_ERROR_MESSAGE =
  "因网络原因Github APP授权登录失败，请您检查网络或稍后再试";

export const authErrorLabel: Record<string, string> = {
  AccessDenied: "您已取消 GitHub 授权，如需使用请重新登录",
  OAuthCallback:
    "GitHub 登录回调失败（常见于 Cookie / HTTPS 代理配置问题），请清除站点 Cookie 后重试",
  Configuration: "认证配置有误，请检查 NEXTAUTH_URL / NEXTAUTH_SECRET 与 GitHub App Callback URL",
  Default: AUTH_NETWORK_ERROR_MESSAGE,
};

export const skipReasonLabel: Record<string, string> = {
  NO_FILES_TO_TRANSLATE: "没有需要翻译的文件",
  EMPTY_REPOSITORY: "仓库为空，还没有可翻译的提交",
};
