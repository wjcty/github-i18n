import type { NextConfig } from "next";

const backendUrl = process.env.API_URL ?? "http://localhost:3123";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // /api 由 app/api/[...path]/route.ts 显式转发，确保 Auth.js Cookie / Set-Cookie 不被 rewrite 丢掉
  env: {
    API_URL: backendUrl,
  },
};

export default nextConfig;
