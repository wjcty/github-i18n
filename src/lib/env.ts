import path from "path";
import { DEFAULT_BACKEND_PORT } from "@/lib/constants";

/**
 * 本地联调：前端 web 在 3001，/api 反代到后端 3123。
 * OAuth 回调 URL 必须是浏览器地址栏的源（3001），不能写后端端口 3123。
 */
const DEFAULT_BROWSER_ORIGIN =
  process.env.AUTH_URL ??
  process.env.NEXTAUTH_URL ??
  "http://localhost:3001";

/** 兼容常见 .env 命名，避免重复配置 */
export function loadEnvAliases() {
  if (!process.env.PORT) {
    process.env.PORT = String(DEFAULT_BACKEND_PORT);
  }

  if (!process.env.AUTH_SECRET && process.env.NEXTAUTH_SECRET) {
    process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
  }

  if (!process.env.AUTH_URL) {
    process.env.AUTH_URL = DEFAULT_BROWSER_ORIGIN;
  }
  if (!process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = process.env.AUTH_URL;
  }
  if (!process.env.APP_URL) {
    process.env.APP_URL = process.env.AUTH_URL;
  }

  if (!process.env.AUTH_GITHUB_ID && process.env.GITHUB_APP_CLIENT_ID) {
    process.env.AUTH_GITHUB_ID = process.env.GITHUB_APP_CLIENT_ID;
  }
  if (!process.env.AUTH_GITHUB_SECRET && process.env.GITHUB_APP_CLIENT_SECRET) {
    process.env.AUTH_GITHUB_SECRET = process.env.GITHUB_APP_CLIENT_SECRET;
  }
  if (!process.env.OPENROUTER_PLATFORM_KEY && process.env.PLATFORM_OPENROUTER_API_KEY) {
    process.env.OPENROUTER_PLATFORM_KEY = process.env.PLATFORM_OPENROUTER_API_KEY;
  }

  const keyRef = process.env.GITHUB_APP_PRIVATE_KEY;
  if (keyRef && !keyRef.includes("BEGIN")) {
    const resolved = path.isAbsolute(keyRef)
      ? keyRef
      : path.resolve(process.cwd(), keyRef);
    process.env.GITHUB_APP_PRIVATE_KEY_PATH = resolved;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
  }
}

loadEnvAliases();
