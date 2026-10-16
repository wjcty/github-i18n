import { type NextRequest } from "next/server";

const backendUrl = (process.env.API_URL ?? "http://localhost:3123").replace(
  /\/$/,
  "",
);

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

async function proxy(req: NextRequest, path: string[]) {
  const incoming = new URL(req.url);
  const dest = `${backendUrl}/api/${path.join("/")}${incoming.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    if (key.toLowerCase() === "host") return;
    headers.set(key, value);
  });

  // ngrok → localhost 时 req.url 常是 http，但浏览器实际是 https。
  // 必须保留上游的 x-forwarded-*，否则 Auth.js 的 Secure Cookie / state 会校验失败。
  const forwardedHost =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    incoming.host;
  const forwardedProto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    ((process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "").startsWith(
      "https",
    )
      ? "https"
      : incoming.protocol.replace(":", "") || "http");

  headers.set("x-forwarded-host", forwardedHost);
  headers.set("x-forwarded-proto", forwardedProto);
  headers.set(
    "x-forwarded-for",
    req.headers.get("x-forwarded-for") ?? "127.0.0.1",
  );

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(dest, init);
  } catch (err) {
    console.error("[proxy] upstream request failed:", dest, err);
    if (path[0] === "auth" && req.method === "GET" && path[1] !== "session" && path[1] !== "csrf") {
      return Response.redirect(new URL("/?error=Network", incoming.origin), 302);
    }
    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "服务暂时不可用，请检查网络或稍后再试",
        },
      },
      { status: 502 },
    );
  }
  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    if (key.toLowerCase() === "set-cookie") return;
    outHeaders.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    outHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function HEAD(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
