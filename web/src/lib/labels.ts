import type { TaskStatus, TranslationStatus } from "./api/types";

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

export const AUTH_NETWORK_ERROR_MESSAGE =
  "因网络原因Github APP授权登录失败，请您检查网络或稍后再试";

export const authErrorLabel: Record<string, string> = {
  AccessDenied: "您已取消 GitHub 授权，如需使用请重新登录",
};

export const skipReasonLabel: Record<string, string> = {
  NO_FILES_TO_TRANSLATE: "没有需要翻译的文件",
  EMPTY_REPOSITORY: "仓库为空，还没有可翻译的提交",
};
