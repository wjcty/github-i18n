"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { ArrowClockwiseIcon, MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react";
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
import {
  closeGitHubAppInstallPopup,
  isGitHubAppInstallPopupClosed,
  openGitHubAppInstallPopup,
  type InstallPopupPhase,
} from "@/lib/github-app-install";

const POLL_MS = 2500;
const POPUP_WATCH_MS = 800;

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
  const [appSlug, setAppSlug] = useState("GitHub App");
  const [installations, setInstallations] = useState<Installation[] | null>(null);
  const [installError, setInstallError] = useState<{
    message: string;
    code: string;
  } | null>(null);
  const [installationId, setInstallationId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<InstallRepoItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [phase, setPhase] = useState<InstallPopupPhase>("waiting");
  const installationIdRef = useRef(installationId);
  const openRef = useRef(false);
  const popupRef = useRef<Window | null>(null);
  const popupOpenedRef = useRef(false);
  const closingByUsRef = useRef(false);
  installationIdRef.current = installationId;
  openRef.current = open;

  const needsInstall =
    installError == null && installations !== null && installations.length === 0;

  const openInstallPopup = useCallback((url: string) => {
    closingByUsRef.current = false;
    const popup = openGitHubAppInstallPopup(url);
    const blocked = !popup || popup.closed;
    popupRef.current = blocked ? null : popup;
    setPhase(blocked ? "blocked" : "waiting");
    return !blocked;
  }, []);

  const loadInstallations = useCallback(async () => {
    try {
      const { items } = await installationsApi.list();
      setInstallError(null);
      setInstallations(items);
      setInstallationId((current) =>
        items.some((i) => String(i.installationId) === current)
          ? current
          : items[0]
            ? String(items[0].installationId)
            : "",
      );
      return items;
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : `加载 ${appSlug} 安装信息失败`;
      const code = e instanceof ApiError ? e.code : "INTERNAL_ERROR";
      setInstallError({ message, code });
      toast.error(message);
      return [];
    }
  }, [appSlug]);

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

  const closeDialog = useCallback(() => {
    closingByUsRef.current = true;
    closeGitHubAppInstallPopup(popupRef.current);
    popupRef.current = null;
    popupOpenedRef.current = false;
    setPhase("waiting");
    setOpen(false);
    openRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      closingByUsRef.current = true;
      closeGitHubAppInstallPopup(popupRef.current);
      popupRef.current = null;
      popupOpenedRef.current = false;
      setPhase("waiting");
      return;
    }

    void metaApi
      .app()
      .then((app) => {
        setInstallUrl(app.githubAppInstallUrl);
        if (app.githubAppSlug) setAppSlug(app.githubAppSlug);
      })
      .catch(() => undefined);
    void loadInstallations();
  }, [open, loadInstallations]);

  useEffect(() => {
    if (!open || !installationId) return;
    void loadRepos(Number(installationId));
  }, [open, installationId, loadRepos]);

  // 未安装时：自动打开安装小窗口，并轮询；装好后关闭导入弹窗
  useEffect(() => {
    if (!open || !needsInstall) return;

    if (installUrl && !popupOpenedRef.current) {
      popupOpenedRef.current = true;
      openInstallPopup(installUrl);
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const { items } = await installationsApi.list();
        if (cancelled || !openRef.current) return;
        if (items.length > 0) {
          setInstallations(items);
          setInstallationId(String(items[0].installationId));
          closingByUsRef.current = true;
          closeGitHubAppInstallPopup(popupRef.current);
          popupRef.current = null;
          popupOpenedRef.current = false;
          toast.success(`「${appSlug}」已安装`);
          closeDialog();
          return;
        }
      } catch (e) {
        if (cancelled || !openRef.current) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          closingByUsRef.current = true;
          closeGitHubAppInstallPopup(popupRef.current);
          popupRef.current = null;
          popupOpenedRef.current = false;
          setInstallError({ message: e.message, code: e.code });
          return;
        }
      }
      if (!cancelled && openRef.current) {
        timer = setTimeout(() => void tick(), POLL_MS);
      }
    };

    void tick();

    const onVisible = () => {
      if (document.visibilityState === "visible" && openRef.current) {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [open, needsInstall, installUrl, appSlug, closeDialog, openInstallPopup]);

  // 检测用户是否关掉了安装小窗口（且尚未装好）
  useEffect(() => {
    if (!open || !needsInstall || phase !== "waiting") return;

    const id = window.setInterval(() => {
      if (closingByUsRef.current) return;
      if (!isGitHubAppInstallPopupClosed(popupRef.current)) return;
      popupRef.current = null;
      setPhase("closed");
    }, POPUP_WATCH_MS);

    return () => window.clearInterval(id);
  }, [open, needsInstall, phase]);

  const installStatusHint =
    phase === "waiting"
      ? "已打开安装页，正在检测安装状态…"
      : phase === "blocked"
        ? "未能自动打开安装窗口（可能被浏览器拦截），请点击下方按钮继续安装。"
        : "未完成安装：安装窗口已关闭。请重新打开安装窗口完成授权。";

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
      closeDialog();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "导入失败");
    } finally {
      setImporting(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setOpen(true);
          openRef.current = true;
          return;
        }
        closeDialog();
      }}
      disablePointerDismissal={needsInstall}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon className="size-4" weight="bold" aria-hidden />
            导入仓库
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入 GitHub 仓库</DialogTitle>
          <DialogDescription>
            {installError ? (
              installError.message
            ) : installations === null ? (
              `正在检测 ${appSlug} 安装状态…`
            ) : needsInstall ? (
              <>
                需要先安装「{appSlug}」并授权仓库。
                <span
                  className={`mt-3 block text-center ${
                    phase === "waiting" ? "text-primary" : "text-destructive"
                  }`}
                >
                  {installStatusHint}
                </span>
              </>
            ) : (
              <>从已授权「{appSlug}」的仓库中选择导入。</>
            )}
          </DialogDescription>
        </DialogHeader>
        {installError ? (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => void loadInstallations()}
            >
              重试
            </Button>
            {installError.code === "UNAUTHORIZED" ? (
              <Button
                className="flex-1"
                onClick={() => void signOut({ callbackUrl: "/" })}
              >
                重新登录
              </Button>
            ) : null}
          </div>
        ) : null}
        {needsInstall &&
        (phase === "blocked" || phase === "closed") &&
        installUrl ? (
          <Button className="w-full" onClick={() => openInstallPopup(installUrl)}>
            打开安装窗口
          </Button>
        ) : null}
        {installError || installations === null || needsInstall ? null : (
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
                <MagnifyingGlassIcon
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
                <ArrowClockwiseIcon
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
