"use client";

import { useCallback, useEffect, useState } from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
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

export function ImportRepoDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [installUrl, setInstallUrl] = useState("");
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [installationId, setInstallationId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<InstallRepoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);

  const loadMeta = useCallback(async () => {
    const app = await metaApi.app();
    setInstallUrl(app.githubAppInstallUrl);
  }, []);

  const loadInstallations = useCallback(async () => {
    const { items } = await installationsApi.list();
    setInstallations(items);
    if (items[0] && !installationId) {
      setInstallationId(String(items[0].installationId));
    }
  }, [installationId]);

  const loadRepos = useCallback(async () => {
    if (!installationId) return;
    setLoading(true);
    try {
      const data = await installationsApi.repos(Number(installationId), {
        q: query || undefined,
      });
      setRepos(data.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载仓库失败");
    } finally {
      setLoading(false);
    }
  }, [installationId, query]);

  useEffect(() => {
    if (!open) return;
    void loadMeta();
    void loadInstallations();
  }, [open, loadMeta, loadInstallations]);

  useEffect(() => {
    if (!open || !installationId) return;
    const t = setTimeout(() => void loadRepos(), 300);
    return () => clearTimeout(t);
  }, [open, installationId, query, loadRepos]);

  async function handleImport(repo: InstallRepoItem) {
    if (repo.alreadyImported) return;
    setImporting(repo.githubRepoId);
    try {
      await reposApi.import({
        installationId: Number(installationId),
        githubRepoId: repo.githubRepoId,
        fullName: repo.fullName,
      });
      toast.success(`已导入 ${repo.fullName}`);
      onImported();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "导入失败");
    } finally {
      setImporting(null);
    }
  }

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>导入 GitHub 仓库</DialogTitle>
          <DialogDescription>
            需先安装 GitHub App。
            {installUrl ? (
              <>
                {" "}
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  前往安装
                </a>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {installations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            未检测到 App 安装，请先完成安装后刷新。
          </p>
        ) : (
          <div className="space-y-4">
            <Select
              value={installationId}
              onValueChange={(v) => v && setInstallationId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择安装账号" />
              </SelectTrigger>
              <SelectContent>
                {installations.map((i) => (
                  <SelectItem
                    key={i.installationId}
                    value={String(i.installationId)}
                  >
                    {i.accountLogin} ({i.accountType})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
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
            <ScrollArea className="h-64 rounded-md border border-border">
              <ul className="divide-y divide-border p-2">
                {loading ? (
                  <li className="p-4 text-center text-sm text-muted-foreground">
                    加载中…
                  </li>
                ) : repos.length === 0 ? (
                  <li className="p-4 text-center text-sm text-muted-foreground">
                    无匹配仓库
                  </li>
                ) : (
                  repos.map((repo) => (
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
