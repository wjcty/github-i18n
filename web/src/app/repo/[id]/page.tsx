"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowSquareOut, Eye, Gear, Play } from "@phosphor-icons/react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { reposApi } from "@/lib/api";
import type { RepoDetail } from "@/lib/api/types";

export default function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setRepo(await reposApi.get(id));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startTranslation(mode: "full" | "incremental") {
    if (!id) return;
    if (session?.emailVerified === false) {
      toast.error("请先在 GitHub 验证主邮箱后再创建翻译任务");
      return;
    }
    if (!repo?.targetLanguages?.length) {
      toast.error("请先在配置页选择目标语言");
      router.push(`/repo/${id}/config`);
      return;
    }
    setStarting(true);
    try {
      const task = await reposApi.createTask(id, { mode });
      toast.success("翻译任务已创建");
      router.push(`/task/${task.taskId}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "创建任务失败");
    } finally {
      setStarting(false);
    }
  }

  if (loading || !repo) {
    return (
      <DashboardShell>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-40 w-full" />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <PageTitle
        title={repo.fullName}
        description={`默认分支 ${repo.defaultBranch} · 基准语言 ${repo.baseLanguage}`}
        backHref="/dashboard"
        actions={
          <>
            <LinkButton variant="outline" size="sm" href={`/repo/${id}/config`}>
              <Gear className="size-4" aria-hidden />
              翻译配置
            </LinkButton>
            <Button
              size="sm"
              disabled={starting}
              onClick={() => void startTranslation("full")}
            >
              <Play className="size-4" weight="fill" aria-hidden />
              全量翻译
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={starting || !repo.lastTranslatedBaseCommit}
              onClick={() => void startTranslation("incremental")}
            >
              增量翻译
            </Button>
          </>
        }
      />

      {session?.emailVerified === false ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>邮箱未验证</AlertTitle>
          <AlertDescription>
            可在 GitHub 设置中验证主邮箱后再创建翻译任务。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-base">配置摘要</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">目标语言：</span>
              {repo.targetLanguages.join(", ") || "未设置"}
            </p>
            <p>
              <span className="text-muted-foreground">自动同步：</span>
              {repo.autoSyncEnabled ? "开启" : "关闭"}
            </p>
            <p>
              <span className="text-muted-foreground">上次基准 commit：</span>
              <span className="font-mono text-xs">
                {repo.lastTranslatedBaseCommit?.slice(0, 7) ?? "—"}
              </span>
            </p>
            {repo.lastPrUrl ? (
              <AnchorButton
                variant="link"
                className="h-auto p-0"
                href={repo.lastPrUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ArrowSquareOut className="size-4" aria-hidden />
                最近 PR #{repo.lastPrNumber}
              </AnchorButton>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 font-mono text-lg font-semibold">任务历史</h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>时间</TableHead>
              <TableHead>模式</TableHead>
              <TableHead className="hidden sm:table-cell">触发</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {repo.recentTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  暂无任务
                </TableCell>
              </TableRow>
            ) : (
              repo.recentTasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs sm:text-sm">
                    {new Date(t.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                      {t.mode}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {t.trigger}
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <LinkButton size="sm" variant="outline" href={`/task/${t.id}`}>
                      <Eye className="size-4" aria-hidden />
                      详情
                    </LinkButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </DashboardShell>
  );
}
