"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowClockwiseIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DashboardShell,
  PageTitle,
} from "@/components/layout/dashboard-shell";
import { FileTreePicker } from "@/components/repos/file-tree-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { metaApi, reposApi } from "@/lib/api";
import type { LanguageMeta, RepoDetail, RepoTree } from "@/lib/api/types";
import { formatLanguageLabel } from "@/lib/labels";

export default function RepoConfigPage() {
  const { id } = useParams<{ id: string }>();
  const [languages, setLanguages] = useState<LanguageMeta[]>([]);
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [tree, setTree] = useState<RepoTree | null>(null);
  const [baseLanguage, setBaseLanguage] = useState("zh-CN");
  const [targetLanguages, setTargetLanguages] = useState<string[]>([]);
  const [includePaths, setIncludePaths] = useState<string[]>([]);
  const [ignoreFileContent, setIgnoreFileContent] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState("");

  const loadTree = useCallback(
    async (refresh = false) => {
      if (!id) return;
      setTreeLoading(true);
      setTreeError("");
      try {
        setTree(await reposApi.tree(id, refresh));
      } catch (e) {
        setTree(null);
        setTreeError(e instanceof ApiError ? e.message : "加载文件树失败");
      } finally {
        setTreeLoading(false);
      }
    },
    [id],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    void loadTree();
    try {
      const [langs, detail] = await Promise.all([
        metaApi.languages(),
        reposApi.get(id),
      ]);
      setLanguages(langs.languages);
      setRepo(detail);
      setBaseLanguage(detail.baseLanguage);
      setTargetLanguages(detail.targetLanguages);
      setIncludePaths(detail.scopeConfig?.includePaths ?? []);
      setIgnoreFileContent(detail.ignoreFileContent ?? "");
      setAutoSyncEnabled(detail.autoSyncEnabled);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载配置失败");
    } finally {
      setLoading(false);
    }
  }, [id, loadTree]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleTarget(code: string) {
    setTargetLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function save() {
    if (!id) return;
    if (targetLanguages.length === 0) {
      toast.error("请至少选择一种目标语言");
      return;
    }
    if (targetLanguages.includes(baseLanguage)) {
      toast.error("目标语言不能包含基准语言");
      return;
    }
    setSaving(true);
    try {
      const updated = await reposApi.patch(id, {
        baseLanguage,
        targetLanguages,
        autoSyncEnabled,
        ignoreFileContent,
        scopeConfig: {
          mode: "paths",
          includePaths,
          excludePaths: [],
        },
      });
      setRepo(updated);
      toast.success("配置已保存（ignore 将在下次翻译 PR 中提交）");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !repo) {
    return (
      <DashboardShell>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-6 h-96 w-full" />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <PageTitle
        title="翻译配置"
        description={repo.fullName}
        backHref={`/repo/${id}`}
        actions={
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            <FloppyDiskIcon className="size-4" weight="fill" aria-hidden />
            保存
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-base">语言</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>基准语言</Label>
              <Select
                items={languages.map((l) => ({
                  value: l.code,
                  label: formatLanguageLabel(l),
                }))}
                value={baseLanguage}
                onValueChange={(v) => v && setBaseLanguage(v)}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {formatLanguageLabel(l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>目标语言（可多选）</Label>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border p-3">
                {languages
                  .filter((l) => l.code !== baseLanguage)
                  .map((l) => {
                    const on = targetLanguages.includes(l.code);
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => toggleTarget(l.code)}
                        className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {formatLanguageLabel(l)}
                      </button>
                    );
                  })}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Webhook 自动同步</p>
                <p className="text-xs text-muted-foreground">
                  默认分支 push 时自动增量翻译
                </p>
              </div>
              <Switch
                checked={autoSyncEnabled}
                onCheckedChange={setAutoSyncEnabled}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-base">
              .github-i18n-ignore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              className="min-h-40 font-mono text-xs"
              value={ignoreFileContent}
              onChange={(e) => setIgnoreFileContent(e.target.value)}
              placeholder={"node_modules/\nCHANGELOG.md\n"}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="font-mono text-base">翻译范围</CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={treeLoading}
            onClick={() => void loadTree(true)}
          >
            <ArrowClockwiseIcon
              className={`size-4 ${treeLoading ? "animate-spin" : ""}`}
              aria-hidden
            />
            刷新文件树
          </Button>
        </CardHeader>
        <CardContent>
          {treeError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{treeError}</AlertDescription>
            </Alert>
          ) : null}
          {treeLoading && !tree ? <Skeleton className="h-72 w-full" /> : null}
          {tree?.empty || tree?.nodes.length === 0 ? (
            <Alert className="mb-4">
              <AlertDescription>
                仓库为空或默认分支还不存在，请先向 GitHub 推送包含 Markdown
                的提交后再刷新。
              </AlertDescription>
            </Alert>
          ) : null}
          {tree?.truncated ? (
            <Alert className="mb-4">
              <AlertDescription>
                文件树过大已被截断，请用手动路径或 ignore 规则补充配置。
              </AlertDescription>
            </Alert>
          ) : null}
          {tree ? (
            <FileTreePicker
              nodes={tree.nodes}
              includePaths={includePaths}
              onChange={setIncludePaths}
            />
          ) : null}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
