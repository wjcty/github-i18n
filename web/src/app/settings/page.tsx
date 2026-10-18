"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DashboardShell,
  PageTitle,
} from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import { metaApi, settingsApi } from "@/lib/api";
import type { BillingMode, UserSettings } from "@/lib/api/types";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [billingMode, setBillingMode] = useState<BillingMode>("PLATFORM");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  /** 仅本地标记；点「保存」后才真正清空服务端 Key */
  const [pendingClearKey, setPendingClearKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearKeyOpen, setClearKeyOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        settingsApi.get(),
        metaApi.models(),
      ]);
      setSettings(s);
      const modelList = m.models.map(({ id, name }) => ({ id, name }));
      const savedId = s.defaultModelId || m.defaultModelId;
      if (savedId && !modelList.some((x) => x.id === savedId)) {
        modelList.unshift({ id: savedId, name: `${savedId}（当前已保存）` });
      }
      setModels(modelList);
      setBillingMode(s.billingMode);
      setDefaultModelId(savedId);
      setApiKey("");
      setPendingClearKey(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const keyConfiguredOnServer = settings?.openrouterKeyConfigured ?? false;
  const hasUsableSavedKey = keyConfiguredOnServer && !pendingClearKey;

  async function save() {
    const trimmedKey = apiKey.trim();
    if (billingMode === "BYOK") {
      if (!hasUsableSavedKey && !trimmedKey) {
        toast.error(
          pendingClearKey
            ? "已标记删除 Key，请填写新的 Key 后再保存，或撤销删除"
            : "自带 Key 模式需填写你自己的 OpenRouter API Key",
        );
        return;
      }
      if (trimmedKey && !trimmedKey.startsWith("sk-or-")) {
        toast.error("OpenRouter API Key 应以 sk-or- 开头");
        return;
      }
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        billingMode,
        defaultModelId,
      };
      if (trimmedKey !== "") {
        body.openrouterApiKey = trimmedKey;
      } else if (pendingClearKey) {
        body.openrouterApiKey = "";
      }
      const updated = await settingsApi.put(body);
      setSettings(updated);
      setApiKey("");
      setPendingClearKey(false);
      toast.success("设置已保存");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function markClearKey() {
    if (!keyConfiguredOnServer) {
      toast.error("当前没有已保存的 OpenRouter Key");
      return;
    }
    setPendingClearKey(true);
    setApiKey("");
    setClearKeyOpen(false);
    toast.message("已标记删除 Key，点击下方「保存」后才会生效");
  }

  if (loading || !settings) {
    return (
      <DashboardShell>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-6 h-72 w-full max-w-2xl" />
      </DashboardShell>
    );
  }

  const quotaPct =
    settings.platformQuota.monthlyCharLimit > 0
      ? Math.min(
          100,
          (settings.platformQuota.monthlyCharUsed /
            settings.platformQuota.monthlyCharLimit) *
            100,
        )
      : 0;

  return (
    <DashboardShell>
      <PageTitle
        title="设置"
        description="OpenRouter 密钥与默认模型"
        backHref="/dashboard"
      />

      <div className="max-w-2xl">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-base">翻译服务</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8 pt-2">
            <div className="space-y-3">
              <Label>计费模式</Label>
              <Select
                items={[
                  { value: "PLATFORM", label: "平台托管配额" },
                  { value: "BYOK", label: "自带 OpenRouter Key" },
                ]}
                value={billingMode}
                onValueChange={(v) => v && setBillingMode(v as BillingMode)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLATFORM">平台托管配额</SelectItem>
                  <SelectItem value="BYOK">自带 OpenRouter Key</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {billingMode === "BYOK"
                  ? "翻译只使用你在下方填写并保存的 Key，不会使用服务器 .env 中的平台 Key；费用由你的 OpenRouter 账户承担。"
                  : "翻译使用平台统一配置的 OpenRouter Key，并受月度字符配额限制。"}
              </p>
            </div>

            <div className="space-y-3">
              <Label>默认模型</Label>
              <Select
                items={models.map((m) => ({ value: m.id, label: m.name }))}
                value={defaultModelId}
                onValueChange={(v) => v && setDefaultModelId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm leading-relaxed text-muted-foreground">
                可选列表为{" "}
                <a
                  href="https://openrouter.ai/rankings"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  OpenRouter 文本模型周榜
                </a>{" "}
                Top 20。
              </p>
            </div>

            {billingMode === "BYOK" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>你的 OpenRouter API Key</Label>
                  <a
                    href={OPENROUTER_KEYS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    获取 API Key
                    <ArrowSquareOutIcon className="size-3.5" aria-hidden />
                  </a>
                </div>

                {pendingClearKey ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
                    已标记删除
                    {settings.openrouterKeyMask
                      ? `（${settings.openrouterKeyMask}）`
                      : ""}
                    。点击下方「保存」后才会从服务器移除；也可{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => setPendingClearKey(false)}
                    >
                      撤销删除
                    </button>
                    。
                  </p>
                ) : hasUsableSavedKey ? (
                  <p className="text-sm text-muted-foreground">
                    已保存你的 Key：{settings.openrouterKeyMask}
                    （输入新 Key 可替换）
                  </p>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    尚未配置。请到{" "}
                    <a
                      href={OPENROUTER_KEYS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      openrouter.ai/keys
                    </a>{" "}
                    创建并粘贴你自己的 Key，否则无法发起翻译。
                  </p>
                )}

                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    hasUsableSavedKey
                      ? "sk-or-v1-…（留空则保留已保存的 Key）"
                      : "sk-or-v1-…（必填，粘贴你自己的 Key）"
                  }
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (e.target.value.trim()) setPendingClearKey(false);
                  }}
                />

                {hasUsableSavedKey ? (
                  <Dialog open={clearKeyOpen} onOpenChange={setClearKeyOpen}>
                    <DialogTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={saving}
                        >
                          删除已保存的 Key
                        </Button>
                      }
                    />
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>删除 OpenRouter API Key</DialogTitle>
                        <DialogDescription>
                          确认后仅在本页标记删除
                          {settings.openrouterKeyMask
                            ? `（${settings.openrouterKeyMask}）`
                            : ""}
                          ，需再点击下方「保存」才会真正从服务器移除。离开页面且未保存则不会删除。
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setClearKeyOpen(false)}
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={markClearKey}
                        >
                          确认删除
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <Label>平台配额</Label>
                <Progress value={quotaPct} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {settings.platformQuota.monthlyCharUsed.toLocaleString()} /{" "}
                  {settings.platformQuota.monthlyCharLimit.toLocaleString()}{" "}
                  字符 · 重置{" "}
                  {new Date(settings.platformQuota.resetAt).toLocaleDateString()}
                </p>
              </div>
            )}

            <div className="border-t border-border pt-6">
              <Button
                className="w-full sm:w-auto sm:min-w-32"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
