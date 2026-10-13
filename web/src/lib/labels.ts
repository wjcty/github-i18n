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

export const skipReasonLabel: Record<string, string> = {
  NO_FILES_TO_TRANSLATE: "没有需要翻译的文件",
};
