import {
  ArrowRight,
  GitPullRequest,
  GlobeHemisphereWest,
  Lightning,
} from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/layout/site-header";
import { AnchorButton, LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authApi, metaApi } from "@/lib/api";

const features = [
  {
    title: "即开即用",
    desc: "无需 GitHub Actions 或本地环境，浏览器内完成配置与触发。",
    icon: Lightning,
  },
  {
    title: "PR 交付",
    desc: "译文写入功能分支并自动开 Pull Request，Review 后合并。",
    icon: GitPullRequest,
  },
  {
    title: "走向全球",
    desc: "多语言 README 链接、增量同步，扩大开源项目影响力。",
    icon: GlobeHemisphereWest,
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  let session = null;
  try {
    session = await authApi.session();
  } catch {
    session = null;
  }
  let installUrl = "/api/auth/signin/github";
  try {
    const app = await metaApi.app();
    installUrl = app.githubAppInstallUrl;
  } catch {
    /* backend optional at build */
  }

  const callback = sp.callbackUrl ?? "/dashboard";

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
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
          <p className="font-mono text-sm font-medium text-primary">
            零配置 · 一键翻译
          </p>
          <h1 className="mt-3 max-w-2xl font-mono text-4xl font-bold tracking-tight md:text-5xl">
            让你的 GitHub 项目走向全球
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            GitHub-i18n 帮助开源维护者将文档自动翻译为多种语言，支持增量同步与
            OpenRouter 多模型。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {session?.user ? (
              <LinkButton size="lg" href={callback}>
                进入仪表盘
                <ArrowRight className="size-4" weight="bold" aria-hidden />
              </LinkButton>
            ) : (
              <>
                <AnchorButton size="lg" href="/api/auth/signin/github">
                  GitHub 登录
                </AnchorButton>
                <AnchorButton
                  size="lg"
                  variant="outline"
                  href={installUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  安装 GitHub App
                </AnchorButton>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
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
