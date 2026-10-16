"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GithubLogoIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { installationsApi, metaApi } from "@/lib/api";
import {
  closeGitHubAppInstallPopup,
  isGitHubAppInstallPopupClosed,
  openGitHubAppInstallPopup,
  type InstallPopupPhase,
} from "@/lib/github-app-install";

const POLL_MS = 2500;
const POPUP_WATCH_MS = 800;

/**
 * 登录后若尚未安装 App：自动弹出小窗口打开安装页，本站显示状态弹窗并轮询；
 * 用户关掉安装小窗口且未装好时，提示未完成安装并提供「打开安装窗口」；
 * 安装成功后关闭状态弹窗；也可手动关掉状态弹窗。
 */
export function InstallPromptDialog({
  onInstalled,
}: {
  onInstalled?: () => void;
} = {}) {
  const [open, setOpen] = useState(false);
  const [installUrl, setInstallUrl] = useState("");
  const [appSlug, setAppSlug] = useState("GitHub App");
  const [phase, setPhase] = useState<InstallPopupPhase>("waiting");
  const skippedThisVisitRef = useRef(false);
  const openRef = useRef(false);
  const popupRef = useRef<Window | null>(null);
  /** 本页主动 close 安装窗时不要当成「用户未安装就关掉」 */
  const closingByUsRef = useRef(false);
  openRef.current = open;

  const openInstallPopup = useCallback((url: string) => {
    closingByUsRef.current = false;
    const popup = openGitHubAppInstallPopup(url);
    const blocked = !popup || popup.closed;
    popupRef.current = blocked ? null : popup;
    setPhase(blocked ? "blocked" : "waiting");
    return !blocked;
  }, []);

  const finishInstalled = useCallback(() => {
    closingByUsRef.current = true;
    closeGitHubAppInstallPopup(popupRef.current);
    popupRef.current = null;
    setOpen(false);
    openRef.current = false;
    setPhase("waiting");
    toast.success(`「${appSlug}」已安装`);
    onInstalled?.();
  }, [appSlug, onInstalled]);

  const dismiss = useCallback(() => {
    skippedThisVisitRef.current = true;
    closingByUsRef.current = true;
    closeGitHubAppInstallPopup(popupRef.current);
    popupRef.current = null;
    setOpen(false);
    openRef.current = false;
    setPhase("waiting");
  }, []);

  const checkInstalled = useCallback(async (): Promise<boolean | null> => {
    try {
      const { items } = await installationsApi.list();
      return items.length > 0;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.removeItem("ghi18n:install-prompt-dismissed");
    } catch {
      /* ignore */
    }

    let cancelled = false;
    void (async () => {
      try {
        const [{ items }, app] = await Promise.all([
          installationsApi.list(),
          metaApi.app().catch(() => ({
            githubAppInstallUrl: "",
            githubAppSlug: "GitHub App",
          })),
        ]);
        if (cancelled || skippedThisVisitRef.current) return;
        if (app.githubAppSlug) setAppSlug(app.githubAppSlug);
        setInstallUrl(app.githubAppInstallUrl);
        if (items.length > 0) return;

        setOpen(true);
        openRef.current = true;
        if (app.githubAppInstallUrl) {
          openInstallPopup(app.githubAppInstallUrl);
        } else {
          setPhase("blocked");
        }
      } catch {
        /* 网络异常时不弹窗 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openInstallPopup]);

  // 轮询是否已安装
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const installed = await checkInstalled();
      if (cancelled || !openRef.current) return;
      if (installed === true) {
        finishInstalled();
        return;
      }
      if (installed === null) return;
      timer = setTimeout(() => void tick(), POLL_MS);
    };

    void tick();

    const onVisible = () => {
      if (document.visibilityState !== "visible" || !openRef.current) return;
      void checkInstalled().then((installed) => {
        if (installed === true && openRef.current) finishInstalled();
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [open, checkInstalled, finishInstalled]);

  // 检测用户是否关掉了安装小窗口（且尚未装好）
  useEffect(() => {
    if (!open || phase !== "waiting") return;

    const id = window.setInterval(() => {
      if (closingByUsRef.current) return;
      if (!isGitHubAppInstallPopupClosed(popupRef.current)) return;
      popupRef.current = null;
      setPhase("closed");
    }, POPUP_WATCH_MS);

    return () => window.clearInterval(id);
  }, [open, phase]);

  const statusHint =
    phase === "waiting"
      ? "已打开安装页，正在检测安装状态…"
      : phase === "blocked"
        ? "未能自动打开安装窗口（可能被浏览器拦截），请点击下方按钮继续安装。"
        : "未完成安装：安装窗口已关闭。请重新打开安装窗口完成授权。";

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(v) => {
        if (v) {
          setOpen(true);
          openRef.current = true;
          return;
        }
        dismiss();
      }}
    >
      <DialogContent showCloseButton className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GithubLogoIcon className="size-5 text-primary" weight="fill" aria-hidden />
            安装 {appSlug}
          </DialogTitle>
          <DialogDescription>
            需要安装「{appSlug}」并授权仓库，才能读取文档并提交翻译 PR。
            <span
              className={`mt-3 block text-center ${
                phase === "waiting" ? "text-primary" : "text-destructive"
              }`}
            >
              {statusHint}
            </span>
          </DialogDescription>
        </DialogHeader>
        {(phase === "blocked" || phase === "closed") && installUrl ? (
          <Button
            className="w-full"
            onClick={() => openInstallPopup(installUrl)}
          >
            打开安装窗口
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
