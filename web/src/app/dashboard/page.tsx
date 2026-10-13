"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DashboardShell,
  EmptyReposHint,
  PageTitle,
} from "@/components/layout/dashboard-shell";
import { ImportRepoDialog } from "@/components/repos/import-repo-dialog";
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
import { reposApi } from "@/lib/api";
import type { RepoListItem } from "@/lib/api/types";

export default function DashboardPage() {
  const [items, setItems] = useState<RepoListItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <DashboardShell>
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
        <EmptyReposHint />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
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
                      ? repo.targetLanguages.join(", ")
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
                          <ArrowSquareOut className="size-4" aria-hidden />
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
      )}
    </DashboardShell>
  );
}
