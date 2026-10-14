"use client";

import { useSession } from "next-auth/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { AnchorButton, LinkButton } from "@/components/ui/link-button";
import { GitHubSignInButton } from "@/components/auth/github-signin-button";

export function HomeHeroActions({
  installUrl,
  appSlug = "GitHub App",
  callbackUrl,
}: {
  installUrl: string;
  appSlug?: string;
  callbackUrl: string;
}) {
  const { data: session, status } = useSession();
  const loggedIn = status === "authenticated" && session?.user;

  if (status === "loading") {
    return <div className="mt-8 h-9 w-40 animate-pulse rounded-lg bg-muted" />;
  }

  if (loggedIn) {
    return (
      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton size="lg" href={callbackUrl || "/dashboard"}>
          进入仪表盘
          <ArrowRightIcon className="size-4" weight="bold" aria-hidden />
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <GitHubSignInButton size="lg" callbackUrl={callbackUrl || "/dashboard"} />
      {installUrl ? (
        <AnchorButton
          size="lg"
          variant="outline"
          href={installUrl}
          target="_blank"
          rel="noreferrer"
        >
          安装 {appSlug}
        </AnchorButton>
      ) : null}
    </div>
  );
}
