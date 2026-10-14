"use client";

import { useEffect, useState } from "react";
import { GithubLogo } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type Props = {
  callbackUrl?: string;
  children?: React.ReactNode;
} & VariantProps<typeof buttonVariants>;

export function GitHubSignInButton({
  callbackUrl = "/dashboard",
  size = "sm",
  variant = "default",
  children,
}: Props) {
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    void fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { csrfToken?: string }) => setCsrfToken(d.csrfToken ?? ""))
      .catch(() => setCsrfToken(""));
  }, []);

  return (
    <form action="/api/auth/signin/github" method="post">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit" size={size} variant={variant} disabled={!csrfToken}>
        <GithubLogo className="size-4" weight="fill" aria-hidden />
        {children ?? "GitHub 登录"}
      </Button>
    </form>
  );
}
