"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { GlobeHemisphereWest, GithubLogo, SignOut } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { AnchorButton, LinkButton } from "@/components/ui/link-button";

export function SiteHeader() {
  const { data: session, status } = useSession();
  const loggedIn = status === "authenticated" && session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          <GlobeHemisphereWest
            className="size-5 text-primary"
            weight="duotone"
            aria-hidden
          />
          GitHub-i18n
        </Link>
        <nav className="flex items-center gap-2">
          {loggedIn ? (
            <>
              <LinkButton variant="ghost" size="sm" href="/dashboard">
                仪表盘
              </LinkButton>
              <LinkButton variant="ghost" size="sm" href="/settings">
                设置
              </LinkButton>
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                <SignOut className="size-4" aria-hidden />
                退出
              </Button>
            </>
          ) : (
            <AnchorButton size="sm" href="/api/auth/signin/github">
              <GithubLogo className="size-4" weight="fill" aria-hidden />
              GitHub 登录
            </AnchorButton>
          )}
        </nav>
      </div>
    </header>
  );
}
