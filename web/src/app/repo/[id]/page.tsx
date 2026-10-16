"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowSquareOutIcon,
  EyeIcon,
  GearIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DashboardShell,
  PageTitle,
} from "@/components/layout/dashboard-shell";
import {
  DataTableFilter,
  DataTableFrame,
  DataTablePagination,
  FilterField,
  STICKY_TABLE_HEADER,
  TABLE_SCROLL_CONTAINER,
  usePageSizePreference,
} from "@/components/data-table";
import { TaskStatusBadge } from "@/components/repos/translation-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnchorButton, LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { metaApi, reposApi } from "@/lib/api";
import type { LanguageMeta, RepoDetail, TaskDetail } from "@/lib/api/types";
import {
  formatDateTime,
  formatLanguageCodeLabel,
  formatLanguageList,
  taskModeLabel,
  taskStatusLabel,
} from "@/lib/labels";

const MODE_ALL = "all";
const STATUS_ALL = "all";

const modeItems = [
  { value: MODE_ALL, label: "全部" },
  { value: "full", label: taskModeLabel.full },
  { value: "incremental", label: taskModeLabel.incremental },
];

const statusItems = [
  { value: STATUS_ALL, label: "全部" },
  ...Object.entries(taskStatusLabel).map(([value, label]) => ({
    value,
    label,
  })),
];

type TaskFilters = {
  createdAt: string;
  mode: string;
  status: string;
};

const emptyFilters: TaskFilters = {
  createdAt: "",
  mode: MODE_ALL,
  status: STATUS_ALL,
};

export default function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { pageSize, setPageSize, sizes } = usePageSizePreference();
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [languages, setLanguages] = useState<LanguageMeta[]>([]);
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<TaskFilters>(emptyFilters);
  const [applied, setApplied] = useState<TaskFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadRepo = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detail, langs] = await Promise.all([
        reposApi.get(id),
        metaApi.languages(),
      ]);
      setRepo(detail);
      setLanguages(langs.languages);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadTasks = useCallback(async () => {
    if (!id || pageSize == null) return;
    setTableLoading(true);
    try {
      const data = await reposApi.tasks(id, page, pageSize, {
        createdAt: applied.createdAt,
        mode: applied.mode === MODE_ALL ? undefined : applied.mode,
        status: applied.status === STATUS_ALL ? undefined : applied.status,
      });
      setTasks(data.items);
      setTotal(data.total);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载任务失败");
    } finally {
      setTableLoading(false);
    }
  }, [applied, id, page, pageSize]);

  useEffect(() => {
    void loadRepo();
  }, [loadRepo]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

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

  function applyFilters() {
    setPage(1);
    setApplied({ ...draft });
  }

  function resetFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setPage(1);
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
        description={`默认分支 ${repo.defaultBranch} · 基准语言 ${formatLanguageCodeLabel(repo.baseLanguage, languages)}`}
        backHref="/dashboard"
        actions={
          <>
            <LinkButton variant="outline" size="sm" href={`/repo/${id}/config`}>
              <GearIcon className="size-4" aria-hidden />
              翻译配置
            </LinkButton>
            <Button
              size="sm"
              disabled={starting}
              onClick={() => void startTranslation("full")}
            >
              <PlayIcon className="size-4" weight="fill" aria-hidden />
              全量翻译
            </Button>
            {/* <Button
              size="sm"
              variant="secondary"
              disabled={starting || !repo.lastTranslatedBaseCommit}
              onClick={() => void startTranslation("incremental")}
            >
              增量翻译
            </Button> */}
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
              {repo.targetLanguages.length ? (
                <>
                  <span className="sm:hidden">
                    {formatLanguageList(
                      repo.targetLanguages,
                      languages,
                      1,
                      "、",
                    )}
                  </span>
                  <span className="hidden sm:inline">
                    {formatLanguageList(
                      repo.targetLanguages,
                      languages,
                      3,
                      "、",
                    )}
                  </span>
                </>
              ) : (
                "未设置"
              )}
            </p>
            <p>
              <span className="text-muted-foreground">自动翻译：</span>
              {repo.autoTranslate ? "开启" : "关闭"}
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
                <ArrowSquareOutIcon className="size-4" aria-hidden />
                最近 PR #{repo.lastPrNumber}
              </AnchorButton>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 font-mono text-lg font-semibold">历史任务</h2>
      <DataTableFilter
        onSubmit={applyFilters}
        onReset={resetFilters}
        submitting={tableLoading}
      >
        <FilterField label="时间" htmlFor="task-created-at">
          <Input
            id="task-created-at"
            value={draft.createdAt}
            placeholder="请输入时间"
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, createdAt: e.target.value }))
            }
          />
        </FilterField>
        <FilterField label="模式">
          <Select
            items={modeItems}
            value={draft.mode}
            onValueChange={(v) =>
              v && setDraft((prev) => ({ ...prev, mode: v }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="状态">
          <Select
            items={statusItems}
            value={draft.status}
            onValueChange={(v) =>
              v && setDraft((prev) => ({ ...prev, status: v }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </DataTableFilter>
      <DataTableFrame
        footer={
          pageSize != null ? (
            <DataTablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              pageSizes={sizes}
              disabled={tableLoading}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPage(1);
                setPageSize(size);
              }}
            />
          ) : null
        }
      >
        <Table containerClassName={TABLE_SCROLL_CONTAINER}>
          <TableHeader className={STICKY_TABLE_HEADER}>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>时间</TableHead>
              <TableHead>模式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableLoading && tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  暂无任务
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs sm:text-sm">
                    {formatDateTime(t.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                      {taskModeLabel[t.mode] ?? t.mode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <LinkButton size="sm" variant="outline" href={`/task/${t.id}`}>
                      <EyeIcon className="size-4" aria-hidden />
                      详情
                    </LinkButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTableFrame>
    </DashboardShell>
  );
}
