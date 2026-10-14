"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  GearSixIcon,
  GlobeHemisphereWestIcon,
  HouseIcon,
  SignOutIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { GitHubSignInButton } from "@/components/auth/github-signin-button";

export function SiteHeader() {
  const { data: session, status } = useSession();
  const loggedIn = status === "authenticated" && session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 md:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-mono text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          <GlobeHemisphereWestIcon
            className="size-5 text-primary"
            weight="duotone"
            aria-hidden
          />
          GitHub-i18n
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {loggedIn ? (
            <>
              <LinkButton variant="ghost" size="sm" href="/dashboard" aria-label="仪表盘">
                <HouseIcon className="size-4 sm:hidden" aria-hidden />
                <span className="hidden sm:inline">仪表盘</span>
              </LinkButton>
              <LinkButton variant="ghost" size="sm" href="/settings" aria-label="设置">
                <GearSixIcon className="size-4 sm:hidden" aria-hidden />
                <span className="hidden sm:inline">设置</span>
              </LinkButton>
              <Button
                variant="outline"
                size="sm"
                aria-label="退出"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                <SignOutIcon className="size-4" aria-hidden />
                <span className="hidden sm:inline">退出</span>
              </Button>
            </>
          ) : (
            <GitHubSignInButton />
          )}
        </nav>
      </div>
    </header>
  );
}
