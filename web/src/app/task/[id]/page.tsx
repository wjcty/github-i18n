"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowSquareOutIcon,
  ArrowCounterClockwiseIcon,
  FileMdIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DashboardShell,
  PageTitle,
} from "@/components/layout/dashboard-shell";
import { TaskStatusBadge } from "@/components/repos/translation-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AnchorButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useTaskProgress } from "@/hooks/use-task-progress";
import { ApiError } from "@/lib/api/client";
import { tasksApi } from "@/lib/api";
import type { TaskFile } from "@/lib/api/types";
import { skipReasonLabel } from "@/lib/labels";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { task, progress, refresh } = useTaskProgress(id);
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [previewLang, setPreviewLang] = useState("");
  const [previewPath, setPreviewPath] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const terminal = task?.status === "completed" || task?.status === "skipped";

  const loadFiles = useCallback(async () => {
    if (!id) return;
    try {
      const data = await tasksApi.files(id);
      setFiles(data.files);
    } catch {
      setFiles([]);
    }
  }, [id]);

  useEffect(() => {
    if (terminal) void loadFiles();
  }, [terminal, loadFiles]);

  useEffect(() => {
    if (task?.targetLanguages?.[0] && !previewLang) {
      setPreviewLang(task.targetLanguages[0]);
    }
  }, [task, previewLang]);

  // 当前语言下可预览的文件
  const filesForLang = files.filter((f) =>
    f.items.some((it) => it.lang === previewLang),
  );

  // 语言或文件列表变化时，保证选中的文件有效
  useEffect(() => {
    if (filesForLang.length === 0) {
      setPreviewPath("");
      return;
    }
    if (!filesForLang.some((f) => f.sourcePath === previewPath)) {
      setPreviewPath(filesForLang[0].sourcePath);
    }
  }, [filesForLang, previewPath]);

  async function loadPreview() {
    if (!id || !previewLang || !previewPath) return;
    setPreviewLoading(true);
    try {
      const data = await tasksApi.preview(id, previewLang, previewPath);
      setPreviewContent(data.content);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "预览不可用");
      setPreviewContent("");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function retry() {
    if (!id) return;
    setRetrying(true);
    try {
      await tasksApi.retry(id);
      toast.success("已重新入队");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "重试失败");
    } finally {
      setRetrying(false);
    }
  }

  if (!task) {
    return (
      <DashboardShell>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-32 w-full" />
      </DashboardShell>
    );
  }

  const pct = progress?.percent ?? task.progress.percent;

  return (
    <DashboardShell>
      <PageTitle
        title="翻译任务"
        description={task.fullName}
        backHref={`/repo/${task.repositoryId}`}
        actions={
          <>
            {task.status === "failed" && task.retryCount < 3 ? (
              <Button
                size="sm"
                disabled={retrying}
                onClick={() => void retry()}
              >
                <ArrowCounterClockwiseIcon className="size-4" aria-hidden />
                重试
              </Button>
            ) : null}
            {task.prUrl ? (
              <AnchorButton size="sm" href={task.prUrl} target="_blank" rel="noreferrer">
                <ArrowSquareOutIcon className="size-4" aria-hidden />
                打开 PR
              </AnchorButton>
            ) : null}
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="font-mono text-base">进度</CardTitle>
          <TaskStatusBadge status={task.status} />
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={pct} className="h-2" />
          <p className="text-sm break-all text-muted-foreground">
            {progress?.doneFiles ?? task.progress.doneFiles} /{" "}
            {progress?.totalFiles ?? task.progress.totalFiles} 文件
            {(progress?.currentFile ?? task.progress.currentFile)
              ? ` · 当前 ${progress?.currentFile ?? task.progress.currentFile}`
              : ""}
          </p>
          {(task.status === "pending" || task.status === "running") &&
          task.errorMessage ? (
            <Alert>
              <AlertTitle>正在自动重试</AlertTitle>
              <AlertDescription className="break-all">
                上次尝试未成功，系统正在自动重试：{task.errorMessage}
              </AlertDescription>
            </Alert>
          ) : null}
          {task.status === "failed" && task.errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>任务失败</AlertTitle>
              <AlertDescription className="break-all">{task.errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          {task.status === "skipped" && task.skipReason ? (
            <Alert>
              <AlertDescription>
                {skipReasonLabel[task.skipReason] ?? task.skipReason}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {terminal && files.length ? (
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="font-mono text-base">翻译文件</CardTitle>
            <span className="text-xs text-muted-foreground">
              共 {files.length} 个
              {task.finishedAt
                ? ` · 完成于 ${new Date(task.finishedAt).toLocaleString()}`
                : ""}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {files.map((f) => (
                <li
                  key={f.sourcePath}
                  className="flex items-start gap-2 px-4 py-2.5"
                >
                  <FileMdIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{f.sourcePath}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.items.map((it) => it.lang).join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {terminal && task.targetLanguages.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-base">结果预览</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                items={task.targetLanguages.map((l) => ({ value: l, label: l }))}
                value={previewLang}
                onValueChange={(v) => v && setPreviewLang(v)}
              >
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="语言" />
                </SelectTrigger>
                <SelectContent>
                  {task.targetLanguages.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                items={filesForLang.map((f) => ({
                  value: f.sourcePath,
                  label: f.sourcePath,
                }))}
                value={previewPath}
                onValueChange={(v) => v && setPreviewPath(v)}
                disabled={filesForLang.length === 0}
              >
                <SelectTrigger className="w-full min-w-0 sm:flex-1">
                  <SelectValue placeholder="选择文件" />
                </SelectTrigger>
                <SelectContent>
                  {filesForLang.map((f) => (
                    <SelectItem key={f.sourcePath} value={f.sourcePath}>
                      {f.sourcePath}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                disabled={!previewPath || previewLoading}
                onClick={() => void loadPreview()}
              >
                {previewLoading ? "加载中…" : "加载预览"}
              </Button>
            </div>
            <Textarea
              readOnly
              className="min-h-64 font-mono text-xs"
              value={previewContent}
              placeholder={
                filesForLang.length === 0
                  ? "该语言暂无可预览的文件"
                  : "选择语言与文件后加载译文…"
              }
            />
          </CardContent>
        </Card>
      ) : null}
    </DashboardShell>
  );
}
