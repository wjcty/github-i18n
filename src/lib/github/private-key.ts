import "@/lib/env";
import fs from "fs";
import path from "path";

function normalizePrivateKey(key: string): string {
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

function resolveKeyPath(configured: string | undefined): string {
  const raw =
    configured ??
    process.env.GITHUB_APP_PRIVATE_KEY_PATH ??
    process.env.GITHUB_APP_PRIVATE_KEY ??
    "private-key.pem";

  if (raw.includes("BEGIN") && raw.includes("PRIVATE KEY")) {
    return raw;
  }

  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/** 从 .env 的 GITHUB_APP_PRIVATE_KEY=./private-key.pem 或默认 private-key.pem 读取 */
export function loadGitHubAppPrivateKey(): string {
  const resolved = resolveKeyPath(process.env.GITHUB_APP_PRIVATE_KEY_PATH);

  if (resolved.includes("BEGIN") && resolved.includes("PRIVATE KEY")) {
    return resolved.trim();
  }

  if (fs.existsSync(resolved)) {
    const pem = fs.readFileSync(resolved, "utf8").trim();
    if (pem.includes("BEGIN") && pem.includes("PRIVATE KEY")) {
      return pem;
    }
    throw new Error(
      `Invalid PEM in ${resolved}. Expected GitHub App private key file.`,
    );
  }

  const inline = process.env.GITHUB_APP_PRIVATE_KEY;
  if (inline && inline.includes("BEGIN")) {
    return normalizePrivateKey(inline);
  }

  throw new Error(
    "GitHub App private key not found. Locally use GITHUB_APP_PRIVATE_KEY=./private-key.pem. On Vercel set GITHUB_APP_PRIVATE_KEY to the PEM text itself (real newlines or \\n), not a file path.",
  );
}
