"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowSquareOut,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DashboardShell,
  PageTitle,
} from "@/components/layout/dashboard-shell";
import { TaskStatusBadge } from "@/components/repos/translation-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AnchorButton, LinkButton } from "@/components/ui/link-button";
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
import { skipReasonLabel } from "@/lib/labels";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { task, progress, refresh } = useTaskProgress(id);
  const [previewLang, setPreviewLang] = useState("");
  const [previewPath, setPreviewPath] = useState("README.md");
  const [previewContent, setPreviewContent] = useState("");
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (task?.targetLanguages?.[0] && !previewLang) {
      setPreviewLang(task.targetLanguages[0]);
    }
  }, [task, previewLang]);

  async function loadPreview() {
    if (!id || !previewLang || !previewPath) return;
    try {
      const data = await tasksApi.preview(id, previewLang, previewPath);
      setPreviewContent(data.content);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "预览不可用");
      setPreviewContent("");
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
        actions={
          <>
            <LinkButton variant="outline" size="sm" href={`/repo/${task.repositoryId}`}>
              仓库
            </LinkButton>
            {task.status === "failed" && task.retryCount < 3 ? (
              <Button
                size="sm"
                disabled={retrying}
                onClick={() => void retry()}
              >
                <ArrowCounterClockwise className="size-4" aria-hidden />
                重试
              </Button>
            ) : null}
            {task.prUrl ? (
              <AnchorButton size="sm" href={task.prUrl} target="_blank" rel="noreferrer">
                <ArrowSquareOut className="size-4" aria-hidden />
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

      {(task.status === "completed" || task.status === "skipped") &&
      task.targetLanguages.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-base">结果预览</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select
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
              <input
                className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 font-mono text-sm sm:w-auto sm:flex-1"
                value={previewPath}
                onChange={(e) => setPreviewPath(e.target.value)}
                placeholder="docs/guide.md"
              />
              <Button type="button" variant="secondary" onClick={() => void loadPreview()}>
                加载预览
              </Button>
            </div>
            <Textarea
              readOnly
              className="min-h-64 font-mono text-xs"
              value={previewContent}
              placeholder="选择语言与路径后加载译文…"
            />
          </CardContent>
        </Card>
      ) : null}
    </DashboardShell>
  );
}
