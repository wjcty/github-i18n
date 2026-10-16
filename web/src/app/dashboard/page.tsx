"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DashboardShell,
  EmptyReposHint,
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
import { ImportRepoDialog } from "@/components/repos/import-repo-dialog";
import { InstallPromptDialog } from "@/components/repos/install-prompt-dialog";
import { TranslationStatusBadge } from "@/components/repos/translation-status-badge";
import { Input } from "@/components/ui/input";
import { AnchorButton, LinkButton } from "@/components/ui/link-button";
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
import type { LanguageMeta, RepoListItem } from "@/lib/api/types";
import { formatLanguageList, translationStatusLabel } from "@/lib/labels";

const STATUS_ALL = "all";

const statusItems = [
  { value: STATUS_ALL, label: "全部" },
  ...Object.entries(translationStatusLabel).map(([value, label]) => ({
    value,
    label,
  })),
];

type RepoFilters = {
  q: string;
  lang: string;
  status: string;
};

const emptyFilters: RepoFilters = {
  q: "",
  lang: "",
  status: STATUS_ALL,
};

export default function DashboardPage() {
  const { pageSize, setPageSize, sizes } = usePageSizePreference();
  const [items, setItems] = useState<RepoListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<RepoFilters>(emptyFilters);
  const [applied, setApplied] = useState<RepoFilters>(emptyFilters);
  const [languages, setLanguages] = useState<LanguageMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [appSlug, setAppSlug] = useState("GitHub App");
  const [hasRepos, setHasRepos] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (pageSize == null) return;
    setLoading(true);
    try {
      const data = await reposApi.list(page, pageSize, {
        q: applied.q,
        lang: applied.lang,
        status: applied.status === STATUS_ALL ? undefined : applied.status,
      });
      setItems(data.items);
      setTotal(data.total);
      const unfiltered =
        !applied.q && !applied.lang && applied.status === STATUS_ALL;
      setHasRepos((prev) => {
        if (unfiltered && page === 1) return data.total > 0;
        return prev ?? data.total > 0;
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载仓库列表失败");
      setHasRepos((prev) => prev ?? true);
    } finally {
      setLoading(false);
    }
  }, [applied, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void metaApi
      .app()
      .then((app) => {
        if (app.githubAppSlug) setAppSlug(app.githubAppSlug);
      })
      .catch(() => undefined);
    void metaApi
      .languages()
      .then((data) => setLanguages(data.languages))
      .catch(() => undefined);
  }, []);

  function applyFilters() {
    setPage(1);
    setApplied({ ...draft });
  }

  function resetFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setPage(1);
  }

  const showEmptyHint = hasRepos === false && items.length === 0;
  const showSkeleton = hasRepos === null && items.length === 0;

  return (
    <DashboardShell>
      <InstallPromptDialog onInstalled={load} />
      <PageTitle
        title="仪表盘"
        description="管理已导入仓库，配置翻译并查看状态。"
        actions={<ImportRepoDialog onImported={load} />}
      />
      {showSkeleton ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : showEmptyHint ? (
        <EmptyReposHint appSlug={appSlug} />
      ) : (
        <>
          <DataTableFilter
            onSubmit={applyFilters}
            onReset={resetFilters}
            submitting={loading}
          >
            <FilterField label="仓库名称" htmlFor="repo-name">
              <Input
                id="repo-name"
                value={draft.q}
                placeholder="请输入仓库名称"
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, q: e.target.value }))
                }
              />
            </FilterField>
            <FilterField label="目标语言" htmlFor="repo-lang">
              <Input
                id="repo-lang"
                value={draft.lang}
                placeholder="请输入翻译的语言"
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, lang: e.target.value }))
                }
              />
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

          <ul className="space-y-3 md:hidden">
            {loading && items.length === 0 ? (
              <li className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                加载中…
              </li>
            ) : items.length === 0 ? (
              <li className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
                没有符合条件的仓库
              </li>
            ) : (
              items.map((repo) => (
                <li
                  key={repo.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-mono text-sm font-medium break-all">
                      {repo.fullName}
                    </p>
                    <TranslationStatusBadge status={repo.translationStatus} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    目标语言：
                    {repo.targetLanguages.length
                      ? formatLanguageList(repo.targetLanguages, languages, 1, "、")
                      : "未配置"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <LinkButton size="sm" className="flex-1" href={`/repo/${repo.id}`}>
                      详情
                    </LinkButton>
                    {repo.lastPrUrl ? (
                      <AnchorButton
                        variant="outline"
                        size="sm"
                        href={repo.lastPrUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ArrowSquareOutIcon className="size-4" aria-hidden />
                        PR
                      </AnchorButton>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>

          <h2 className="mb-3 mt-8 font-mono text-lg font-semibold">已导入仓库</h2>
          <DataTableFrame
            className="hidden md:block"
            footer={
              pageSize != null ? (
                <DataTablePagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  pageSizes={sizes}
                  disabled={loading}
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
                <TableRow>
                  <TableHead>仓库</TableHead>
                  <TableHead>目标语言</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      没有符合条件的仓库
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((repo) => (
                    <TableRow key={repo.id}>
                      <TableCell className="font-mono text-sm">
                        {repo.fullName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {repo.targetLanguages.length
                          ? formatLanguageList(
                              repo.targetLanguages,
                              languages,
                              3,
                              "、",
                            )
                          : "未配置"}
                      </TableCell>
                      <TableCell>
                        <TranslationStatusBadge status={repo.translationStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {repo.lastPrUrl ? (
                            <AnchorButton
                              variant="ghost"
                              size="sm"
                              href={repo.lastPrUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ArrowSquareOutIcon className="size-4" aria-hidden />
                              PR
                            </AnchorButton>
                          ) : null}
                          <LinkButton size="sm" href={`/repo/${repo.id}`}>
                            详情
                          </LinkButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DataTableFrame>

          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card md:hidden">
            {pageSize != null ? (
              <DataTablePagination
                className="border-t-0"
                page={page}
                pageSize={pageSize}
                total={total}
                pageSizes={sizes}
                disabled={loading}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPage(1);
                  setPageSize(size);
                }}
              />
            ) : null}
          </div>
        </>
      )}
    </DashboardShell>
  );
}
