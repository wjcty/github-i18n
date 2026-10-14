"use client";

import { useEffect, useState } from "react";
import { DownloadSimple, GithubLogo } from "@phosphor-icons/react";
import { AnchorButton } from "@/components/ui/link-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { installationsApi, metaApi } from "@/lib/api";

const DISMISS_KEY = "ghi18n:install-prompt-dismissed";

/**
 * 登录后若尚未安装 GitHub App，弹窗让用户自行决定：现在安装，或稍后导入仓库时再装。
 * 关闭后本次会话不再打扰。
 */
export function InstallPromptDialog() {
  const [open, setOpen] = useState(false);
  const [installUrl, setInstallUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [{ items }, app] = await Promise.all([
          installationsApi.list(),
          metaApi.app().catch(() => ({ githubAppInstallUrl: "" })),
        ]);
        if (cancelled) return;
        setInstallUrl(app.githubAppInstallUrl);
        if (items.length === 0) setOpen(true);
      } catch {
        /* 网络异常时不弹窗，避免打扰 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) dismiss();
        else setOpen(true);
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GithubLogo className="size-5 text-primary" weight="fill" aria-hidden />
            安装 GitHub App
          </DialogTitle>
          <DialogDescription>
            需要安装 GitHub App 并授权仓库，才能读取文档并提交翻译 PR。你可以现在安装，也可以稍后在导入仓库时再安装。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>
            稍后安装（导入仓库时）
          </Button>
          {installUrl ? (
            <AnchorButton
              href={installUrl}
              target="_blank"
              rel="noreferrer"
              onClick={dismiss}
            >
              <DownloadSimple className="size-4" weight="bold" aria-hidden />
              安装 GitHub App
            </AnchorButton>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
