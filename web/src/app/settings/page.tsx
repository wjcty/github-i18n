"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react";
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [billingMode, setBillingMode] = useState<BillingMode>("BYOK");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        settingsApi.get(),
        metaApi.models(),
      ]);
      setSettings(s);
      setModels(m.models);
      setBillingMode(s.billingMode);
      setDefaultModelId(s.defaultModelId || m.defaultModelId);
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
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        billingMode,
        defaultModelId,
      };
      if (apiKey !== "") body.openrouterApiKey = apiKey;
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

  async function deleteAccount() {
    if (confirmText !== "DELETE") {
      toast.error('请输入 DELETE 确认');
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
                value={billingMode}
                onValueChange={(v) => v && setBillingMode(v as BillingMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BYOK">自带 OpenRouter Key</SelectItem>
                  <SelectItem value="PLATFORM">平台托管配额</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>默认模型</Label>
              <Select
                value={defaultModelId}
                onValueChange={(v) => v && setDefaultModelId(v)}
              >
                <SelectTrigger>
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
            </div>
            {billingMode === "BYOK" ? (
              <div className="space-y-2">
                <Label>OpenRouter API Key</Label>
                {settings.openrouterKeyConfigured ? (
                  <p className="text-xs text-muted-foreground">
                    已配置：{settings.openrouterKeyMask}
                  </p>
                ) : null}
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="sk-or-v1-…（留空则不修改）"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
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
                    <Trash className="size-4" aria-hidden />
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
