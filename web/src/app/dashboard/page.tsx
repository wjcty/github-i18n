"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DashboardShell,
  EmptyReposHint,
  PageTitle,
} from "@/components/layout/dashboard-shell";
import { ImportRepoDialog } from "@/components/repos/import-repo-dialog";
import { InstallPromptDialog } from "@/components/repos/install-prompt-dialog";
import { TranslationStatusBadge } from "@/components/repos/translation-status-badge";
import { AnchorButton, LinkButton } from "@/components/ui/link-button";
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
import { formatLanguageList } from "@/lib/labels";

export default function DashboardPage() {
  const [items, setItems] = useState<RepoListItem[]>([]);
  const [languages, setLanguages] = useState<LanguageMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [appSlug, setAppSlug] = useState("GitHub App");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reposApi.list();
      setItems(data.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载仓库列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <DashboardShell>
      <InstallPromptDialog onInstalled={load} />
      <PageTitle
        title="仪表盘"
        description="管理已导入仓库，配置翻译并查看状态。"
        actions={<ImportRepoDialog onImported={load} />}
      />
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyReposHint appSlug={appSlug} />
      ) : (
        <>
        <ul className="space-y-3 md:hidden">
          {items.map((repo) => (
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
          ))}
        </ul>
        <div className="hidden overflow-hidden rounded-xl border border-border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>仓库</TableHead>
                <TableHead>目标语言</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((repo) => (
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
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </DashboardShell>
  );
}
