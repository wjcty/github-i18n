import {
  GitPullRequestIcon,
  GlobeHemisphereWestIcon,
  LightningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/layout/site-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { metaApi } from "@/lib/api";
import { AUTH_NETWORK_ERROR_MESSAGE, authErrorLabel } from "@/lib/labels";

const features = [
  {
    title: "即开即用",
    desc: "无需 GitHub Actions 或本地环境，浏览器内完成配置与触发。",
    icon: LightningIcon,
  },
  {
    title: "PR 交付",
    desc: "译文写入功能分支并自动开 Pull Request，Review 后合并。",
    icon: GitPullRequestIcon,
  },
  {
    title: "走向全球",
    desc: "多语言 README 链接、增量同步，扩大开源项目影响力。",
    icon: GlobeHemisphereWestIcon,
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await searchParams;
  let installUrl = "";
  let appSlug = "GitHub App";
  try {
    const app = await metaApi.app();
    installUrl = app.githubAppInstallUrl;
    if (app.githubAppSlug) appSlug = app.githubAppSlug;
  } catch {
    /* backend optional at build */
  }

  const callback = sp.callbackUrl ?? "/dashboard";
  const authError = sp.error
    ? (authErrorLabel[sp.error] ?? AUTH_NETWORK_ERROR_MESSAGE)
    : "";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 20%, #c8102e 0%, transparent 45%), radial-gradient(circle at 80% 60%, #8b0000 0%, transparent 40%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-20 md:px-6 md:py-28">
          {authError ? (
            <Alert variant="destructive" className="mb-6 max-w-xl">
              <AlertTitle>登录失败</AlertTitle>
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          ) : null}
          <p className="font-mono text-sm font-medium text-primary">
            零配置 · 一键翻译
          </p>
          <h1 className="mt-3 max-w-2xl font-mono text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            让你的 GitHub 项目走向全球
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            GitHub-i18n 帮助开源维护者将文档自动翻译为多种语言，支持增量同步与
            OpenRouter 多模型。
          </p>
          {/* <HomeHeroActions
            installUrl={installUrl}
            appSlug={appSlug}
            callbackUrl={callback}
          /> */}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:py-16 md:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map(({ title, desc, icon: Icon }) => (
            <Card key={title} className="border-border/80 shadow-sm">
              <CardHeader>
                <Icon
                  className="size-8 text-primary"
                  weight="duotone"
                  aria-hidden
                />
                <CardTitle className="font-mono text-lg">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
