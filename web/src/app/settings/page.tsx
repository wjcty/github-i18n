"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowSquareOutIcon, TrashIcon } from "@phosphor-icons/react";
import { signOut } from "next-auth/react";
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
  const [billingMode, setBillingMode] = useState<BillingMode>("BYOK");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [clearKeyOpen, setClearKeyOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        settingsApi.get(),
        metaApi.models(),
      ]);
      setSettings(s);
      const modelList = [...m.models];
      const savedId = s.defaultModelId || m.defaultModelId;
      if (savedId && !modelList.some((x) => x.id === savedId)) {
        modelList.unshift({ id: savedId, name: `${savedId}（当前已保存）` });
      }
      setModels(modelList);
      setBillingMode(s.billingMode);
      setDefaultModelId(savedId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const trimmedKey = apiKey.trim();
    if (billingMode === "BYOK") {
      const hasExisting = settings?.openrouterKeyConfigured ?? false;
      if (!hasExisting && !trimmedKey) {
        toast.error("自带 Key 模式需填写你自己的 OpenRouter API Key");
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
      if (trimmedKey !== "") body.openrouterApiKey = trimmedKey;
      const updated = await settingsApi.put(body);
      setSettings(updated);
      setApiKey("");
      toast.success("设置已保存");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearApiKey() {
    if (!settings?.openrouterKeyConfigured) {
      toast.error("当前没有已保存的 OpenRouter Key");
      return;
    }
    setSaving(true);
    try {
      const updated = await settingsApi.put({
        billingMode,
        defaultModelId,
        openrouterApiKey: "",
      });
      setSettings(updated);
      setApiKey("");
      setClearKeyOpen(false);
      toast.success("已删除已保存的 OpenRouter Key");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "删除失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== "DELETE") {
      toast.error("请输入 DELETE 确认");
      return;
    }
    try {
      await settingsApi.deleteUser();
      toast.success("账户已删除");
      await signOut({ callbackUrl: "/" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "删除失败");
    }
  }

  if (loading || !settings) {
    return (
      <DashboardShell>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-6 h-64 w-full" />
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
        description="OpenRouter 密钥、默认模型与账户管理"
        backHref="/dashboard"
        actions={
          <Button disabled={saving} onClick={() => void save()}>
            保存
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-base">翻译服务</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>计费模式</Label>
              <Select
                items={[
                  { value: "BYOK", label: "自带 OpenRouter Key" },
                  { value: "PLATFORM", label: "平台托管配额" },
                ]}
                value={billingMode}
                onValueChange={(v) => v && setBillingMode(v as BillingMode)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BYOK">自带 OpenRouter Key</SelectItem>
                  <SelectItem value="PLATFORM">平台托管配额</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {billingMode === "BYOK"
                  ? "翻译只使用你在下方填写并保存的 Key，不会使用服务器 .env 中的平台 Key；费用由你的 OpenRouter 账户承担。"
                  : "翻译使用平台统一配置的 OpenRouter Key（.env），并受月度字符配额限制。"}
              </p>
            </div>
            <div className="space-y-2">
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
              <p className="text-xs text-muted-foreground">
                可选列表为{" "}
                <a
                  href="https://openrouter.ai/rankings"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  OpenRouter 文本模型周榜
                </a>{" "}
                Top 20.
              </p>
            </div>
            {billingMode === "BYOK" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>你的 OpenRouter API Key</Label>
                  <a
                    href={OPENROUTER_KEYS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    获取 API Key
                    <ArrowSquareOutIcon className="size-3.5" aria-hidden />
                  </a>
                </div>
                {settings.openrouterKeyConfigured ? (
                  <p className="text-xs text-muted-foreground">
                    已保存你的 Key：{settings.openrouterKeyMask}
                    （输入新 Key 可替换）
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
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
                    settings.openrouterKeyConfigured
                      ? "sk-or-v1-…（留空则保留已保存的 Key）"
                      : "sk-or-v1-…（必填，粘贴你自己的 Key）"
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                {settings.openrouterKeyConfigured ? (
                  <Dialog open={clearKeyOpen} onOpenChange={setClearKeyOpen}>
                    <DialogTrigger
                      render={
                        <Button type="button" variant="outline" size="sm" disabled={saving}>
                          删除已保存的 Key
                        </Button>
                      }
                    />
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>删除 OpenRouter API Key</DialogTitle>
                        <DialogDescription>
                          确定删除已保存的 Key
                          {settings.openrouterKeyMask
                            ? `（${settings.openrouterKeyMask}）`
                            : ""}
                          ？删除后需重新填写才能在自带 Key 模式下翻译。
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={saving}
                          onClick={() => setClearKeyOpen(false)}
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={saving}
                          onClick={() => void clearApiKey()}
                        >
                          确认删除
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>平台配额</Label>
                <Progress value={quotaPct} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {settings.platformQuota.monthlyCharUsed.toLocaleString()} /{" "}
                  {settings.platformQuota.monthlyCharLimit.toLocaleString()}{" "}
                  字符 · 重置{" "}
                  {new Date(settings.platformQuota.resetAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="font-mono text-base text-destructive">
              危险区域
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger
                render={
                  <Button variant="destructive">
                    <TrashIcon className="size-4" aria-hidden />
                    删除账户
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>确认删除账户</DialogTitle>
                  <DialogDescription>
                    将删除仓库、任务与加密密钥，不可恢复。输入 DELETE 确认。
                  </DialogDescription>
                </DialogHeader>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                />
                <DialogFooter>
                  <Button variant="destructive" onClick={() => void deleteAccount()}>
                    永久删除
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
