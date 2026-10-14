"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ApiError } from "@/lib/api/client";
import { installationsApi, metaApi, reposApi } from "@/lib/api";
import type { Installation, InstallRepoItem } from "@/lib/api/types";

/** 仓库列表按安装缓存在内存中；每次打开弹窗/回到页面时后台重新拉取，保证新建仓库能出现 */
const repoCache = new Map<number, InstallRepoItem[]>();

function matchesQuery(fullName: string, query: string): boolean {
  const name = fullName.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => name.includes(token));
}

function installationLabel(i: Installation): string {
  return `${i.accountLogin} (${i.accountType})`;
}

export function ImportRepoDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [installUrl, setInstallUrl] = useState("");
  const [installations, setInstallations] = useState<Installation[] | null>(null);
  const [installationId, setInstallationId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<InstallRepoItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const installationIdRef = useRef(installationId);
  installationIdRef.current = installationId;

  const loadInstallations = useCallback(async () => {
    try {
      const { items } = await installationsApi.list();
      setInstallations(items);
      setInstallationId((current) =>
        items.some((i) => String(i.installationId) === current)
          ? current
          : items[0]
            ? String(items[0].installationId)
            : "",
      );
    } catch (e) {
      setInstallations((prev) => prev ?? []);
      toast.error(e instanceof ApiError ? e.message : "加载 GitHub App 安装信息失败");
    }
  }, []);

  const loadRepos = useCallback(async (id: number) => {
    const cached = repoCache.get(id);
    if (cached) setRepos(cached);
    else setLoadingRepos(true);
    setRefreshing(true);
    try {
      const data = await installationsApi.repos(id, { all: true });
      repoCache.set(id, data.items);
      if (installationIdRef.current === String(id)) setRepos(data.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载仓库失败");
    } finally {
      setLoadingRepos(false);
      setRefreshing(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await loadInstallations();
    const id = Number(installationIdRef.current);
    if (id) await loadRepos(id);
  }, [loadInstallations, loadRepos]);

  useEffect(() => {
    if (!open) return;
    void metaApi
      .app()
      .then((app) => setInstallUrl(app.githubAppInstallUrl))
      .catch(() => undefined);
    void loadInstallations();
  }, [open, loadInstallations]);

  useEffect(() => {
    if (!open || !installationId) return;
    void loadRepos(Number(installationId));
  }, [open, installationId, loadRepos]);

  // 用户在新标签页安装 App / 新建仓库后切回来时自动刷新
  useEffect(() => {
    if (!open) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAll();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, refreshAll]);

  const filtered = useMemo(
    () => (query.trim() ? repos.filter((r) => matchesQuery(r.fullName, query)) : repos),
    [repos, query],
  );

  const selectItems = useMemo(
    () =>
      (installations ?? []).map((i) => ({
        value: String(i.installationId),
        label: installationLabel(i),
      })),
    [installations],
  );

  async function handleImport(repo: InstallRepoItem) {
    if (repo.alreadyImported) return;
    setImporting(repo.githubRepoId);
    try {
      const created = await reposApi.import({
        installationId: Number(installationId),
        githubRepoId: repo.githubRepoId,
        fullName: repo.fullName,
      });
      const id = Number(installationId);
      const next = (repoCache.get(id) ?? repos).map((r) =>
        r.githubRepoId === repo.githubRepoId
          ? { ...r, alreadyImported: true, platformRepoId: created.id }
          : r,
      );
      repoCache.set(id, next);
      setRepos(next);
      toast.success(`已导入 ${repo.fullName}`);
      onImported();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "导入失败");
    } finally {
      setImporting(null);
    }
  }

  const installLink = installUrl ? (
    <a
      href={installUrl}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {installations?.length ? "在 GitHub 上配置可访问仓库" : "前往安装"}
    </a>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" weight="bold" aria-hidden />
            导入仓库
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入 GitHub 仓库</DialogTitle>
          <DialogDescription>
            {installations === null ? (
              "正在检测 GitHub App 安装状态…"
            ) : installations.length ? (
              <>从已授权 GitHub App 的仓库中选择导入。找不到仓库？{installLink}</>
            ) : (
              <>需先安装 GitHub App。{installLink}</>
            )}
          </DialogDescription>
        </DialogHeader>
        {installations === null ? null : installations.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              未检测到 App 安装。完成安装后返回本页会自动刷新，也可手动刷新。
            </p>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()}>
              <ArrowClockwise className="size-4" aria-hidden />
              我已完成安装，刷新
            </Button>
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <Select
              items={selectItems}
              value={installationId}
              onValueChange={(v) => v && setInstallationId(v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择安装账号" />
              </SelectTrigger>
              <SelectContent>
                {selectItems.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="pl-9"
                  placeholder="搜索仓库名…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="刷新仓库列表"
                title="刷新仓库列表"
                disabled={refreshing}
                onClick={() => void loadRepos(Number(installationId))}
              >
                <ArrowClockwise
                  className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                  aria-hidden
                />
              </Button>
            </div>
            <ScrollArea className="h-64 rounded-md border border-border">
              <ul className="divide-y divide-border p-2">
                {loadingRepos ? (
                  <li className="p-4 text-center text-sm text-muted-foreground">
                    加载中…
                  </li>
                ) : filtered.length === 0 ? (
                  <li className="p-4 text-center text-sm text-muted-foreground">
                    无匹配仓库
                  </li>
                ) : (
                  filtered.map((repo) => (
                    <li
                      key={repo.githubRepoId}
                      className="flex items-center justify-between gap-2 px-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {repo.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {repo.defaultBranch}
                          {repo.private ? " · 私有" : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        variant={repo.alreadyImported ? "secondary" : "default"}
                        disabled={
                          repo.alreadyImported ||
                          importing === repo.githubRepoId
                        }
                        onClick={() => void handleImport(repo)}
                      >
                        {repo.alreadyImported ? "已导入" : "导入"}
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
