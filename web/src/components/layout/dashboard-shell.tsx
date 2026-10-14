import Link from "next/link";
import { ArrowLeft, FolderGit2, Home, Settings } from "lucide-react";
import { SiteHeader } from "./site-header";
import { LinkButton } from "@/components/ui/link-button";

const nav = [
  { href: "/dashboard", label: "仓库", icon: Home },
  { href: "/settings", label: "设置", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto flex max-w-6xl gap-6 px-3 py-4 sm:px-4 sm:py-6 md:px-6">
        <aside className="hidden w-44 shrink-0 md:block">
          <nav className="sticky top-20 space-y-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({
  title,
  description,
  actions,
  backHref,
  backLabel = "返回",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        {backHref ? (
          <LinkButton
            variant="ghost"
            size="icon-sm"
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="mt-0.5 shrink-0"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </LinkButton>
        ) : null}
        <div className="min-w-0">
          <h1 className="font-mono text-xl font-semibold tracking-tight break-all sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm break-all text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyReposHint() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <FolderGit2 className="size-10 text-primary" aria-hidden />
      <p className="mt-4 font-medium">还没有导入仓库</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        请先安装 GitHub App，然后从已授权的仓库中选择导入。
      </p>
    </div>
  );
}
