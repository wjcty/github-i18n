import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = ["/dashboard", "/repo", "/task", "/settings"];

/**
 * 会话校验走本地后端，避免经 ngrok 公网回环（免费版会插拦截页导致 JSON 解析失败）。
 */
function sessionCheckUrl(request: NextRequest): string {
  const backend = (process.env.API_URL ?? "http://localhost:3123").replace(
    /\/$/,
    "",
  );
  return `${backend}/api/auth/session`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const origin = request.nextUrl.origin;
  let session: { user?: { id?: string } } | null = null;
  try {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      request.nextUrl.protocol.replace(":", "") ||
      "https";
    const host =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.nextUrl.host;

    const sessionRes = await fetch(sessionCheckUrl(request), {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        "x-forwarded-host": host,
        "x-forwarded-proto": proto,
        // 若误走公网 ngrok，跳过浏览器警告页
        "ngrok-skip-browser-warning": "1",
      },
      cache: "no-store",
    });
    if (sessionRes.ok) {
      session = (await sessionRes.json()) as { user?: { id?: string } };
    }
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
