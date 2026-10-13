import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = ["/dashboard", "/repo", "/task", "/settings"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const origin = request.nextUrl.origin;
  const sessionRes = await fetch(`${origin}/api/auth/session`, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  let session: { user?: { id?: string } } | null = null;
  try {
    session = (await sessionRes.json()) as { user?: { id?: string } };
  } catch {
    session = null;
  }

  if (!session?.user?.id) {
    const login = new URL("/", origin);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/repo/:path*", "/task/:path*", "/settings/:path*"],
};
