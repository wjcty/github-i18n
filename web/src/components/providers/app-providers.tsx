"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth">
      {children}
      <Toaster richColors closeButton position="top-right" />
    </SessionProvider>
  );
}
