"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GithubLogo } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { AUTH_NETWORK_ERROR_MESSAGE } from "@/lib/labels";
import type { VariantProps } from "class-variance-authority";

type Props = {
  callbackUrl?: string;
  children?: React.ReactNode;
} & VariantProps<typeof buttonVariants>;

async function fetchCsrfToken(): Promise<string> {
  const r = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error(`csrf ${r.status}`);
  const d = (await r.json()) as { csrfToken?: string };
  if (!d.csrfToken) throw new Error("csrf missing");
  return d.csrfToken;
}

export function GitHubSignInButton({
  callbackUrl = "/dashboard",
  size = "sm",
  variant = "default",
  children,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadToken = useCallback(async () => {
    try {
      const token = await fetchCsrfToken();
      setCsrfToken(token);
      return token;
    } catch {
      setCsrfToken("");
      return "";
    }
  }, []);

  useEffect(() => {
    void loadToken();
  }, [loadToken]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (csrfToken) return;
    e.preventDefault();
    setSubmitting(true);
    const token = await loadToken();
    if (!token) {
      setSubmitting(false);
      toast.error(AUTH_NETWORK_ERROR_MESSAGE);
      return;
    }
    const input = formRef.current?.elements.namedItem("csrfToken") as HTMLInputElement | null;
    if (input) input.value = token;
    formRef.current?.submit();
  }

  return (
    <form
      ref={formRef}
      action="/api/auth/signin/github"
      method="post"
      onSubmit={(e) => void handleSubmit(e)}
    >
      <input type="hidden" name="csrfToken" value={csrfToken} readOnly />
      <input type="hidden" name="callbackUrl" value={callbackUrl} readOnly />
      <Button type="submit" size={size} variant={variant} disabled={submitting}>
        <GithubLogo className="size-4" weight="fill" aria-hidden />
        {children ?? "GitHub 登录"}
      </Button>
    </form>
  );
}
