import { Octokit } from "octokit";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

const REFRESH_SKEW_MS = 60_000;
const refreshInflight = new Map<string, Promise<string | null>>();

export class GitHubUserAuthError extends Error {
  constructor(message = "GitHub 授权已失效，请退出后重新登录") {
    super(message);
    this.name = "GitHubUserAuthError";
  }
}

function oauthClient() {
  return {
    clientId: process.env.AUTH_GITHUB_ID ?? process.env.GITHUB_APP_CLIENT_ID ?? "",
    clientSecret:
      process.env.AUTH_GITHUB_SECRET ?? process.env.GITHUB_APP_CLIENT_SECRET ?? "",
  };
}

export function isGitHubUnauthorized(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 401
  );
}

export function isGitHubNetworkError(err: unknown): boolean {
  const cause =
    typeof err === "object" && err !== null && "cause" in err
      ? String((err as { cause?: unknown }).cause)
      : "";
  const message = `${err instanceof Error ? err.message : String(err)} ${cause}`;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(
    message,
  );
}

export async function refreshUserAccessToken(
  userId: string,
): Promise<string | null> {
  const pending = refreshInflight.get(userId);
  if (pending) return pending;
  const job = refreshUserAccessTokenOnce(userId).finally(() => {
    refreshInflight.delete(userId);
  });
  refreshInflight.set(userId, job);
  return job;
}

async function refreshUserAccessTokenOnce(
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { encryptedRefreshToken: true },
  });
  const refreshToken = user?.encryptedRefreshToken
    ? decrypt(user.encryptedRefreshToken)
    : null;
  const { clientId, clientSecret } = oauthClient();
  if (!refreshToken || !clientId || !clientSecret) return null;

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "github-i18n",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!res.ok || !data?.access_token) {
    console.error(
      "[github] refresh user token failed:",
      res.status,
      data?.error ?? "",
      data?.error_description ?? "",
    );
    return null;
  }

  const expiresAt = data.expires_in
    ? Math.floor(Date.now() / 1000) + data.expires_in
    : null;
  await persistUserTokens(
    userId,
    data.access_token,
    data.refresh_token ?? refreshToken,
    expiresAt,
  );
  await prisma.account.updateMany({
    where: { userId, provider: "github" },
    data: {
      access_token: data.access_token,
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
      expires_at: expiresAt,
    },
  });
  return data.access_token;
}

export async function getUserAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const access = user?.encryptedAccessToken
    ? decrypt(user.encryptedAccessToken)
    : null;
  const expiresAt = user?.tokenExpiresAt?.getTime();
  const expired = expiresAt != null && expiresAt <= Date.now() + REFRESH_SKEW_MS;

  if (access && !expired) return access;
  if (user?.encryptedRefreshToken) {
    const refreshed = await refreshUserAccessToken(userId);
    if (refreshed) return refreshed;
  }
  if (expired) return null;
  if (access) return access;

  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
  });
  return account?.access_token ?? null;
}

export async function withUserOctokit<T>(
  userId: string,
  run: (octokit: Octokit) => Promise<T>,
): Promise<T> {
  const token = await getUserAccessToken(userId);
  if (!token) throw new GitHubUserAuthError();

  try {
    return await run(new Octokit({ auth: token }));
  } catch (err) {
    if (!isGitHubUnauthorized(err)) throw err;
    const refreshed = await refreshUserAccessToken(userId);
    if (!refreshed || refreshed === token) throw new GitHubUserAuthError();
    try {
      return await run(new Octokit({ auth: refreshed }));
    } catch (retryErr) {
      if (isGitHubUnauthorized(retryErr)) throw new GitHubUserAuthError();
      throw retryErr;
    }
  }
}

export async function persistUserTokens(
  userId: string,
  accessToken: string,
  refreshToken?: string | null,
  expiresAt?: number | null,
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      encryptedAccessToken: encrypt(accessToken),
      encryptedRefreshToken: refreshToken
        ? encrypt(refreshToken)
        : undefined,
      tokenExpiresAt: expiresAt ? new Date(expiresAt * 1000) : undefined,
    },
  });
}

export async function getUserOctokit(userId: string): Promise<Octokit | null> {
  const token = await getUserAccessToken(userId);
  if (!token) return null;
  return new Octokit({ auth: token });
}

export async function syncPrimaryEmail(userId: string): Promise<boolean> {
  const octokit = await getUserOctokit(userId);
  if (!octokit) return false;
  try {
    const { data } = await octokit.rest.users.listEmailsForAuthenticatedUser();
    const primary = data.find((e) => e.primary && e.verified);
    await prisma.user.update({
      where: { id: userId },
      data: {
        primaryEmail: primary?.email ?? data[0]?.email ?? null,
        emailVerified: Boolean(primary),
      },
    });
    return Boolean(primary);
  } catch {
    return false;
  }
}

/**
 * 退出登录时撤销 GitHub App 对本用户的 OAuth 授权（grant）。
 * 下次登录会重新出现「授权本应用」确认页，而不是静默复用旧授权。
 * 见：DELETE /applications/{client_id}/grant
 */
export async function revokeGitHubAppAuthorization(userId: string): Promise<void> {
  const accessToken = await getUserAccessToken(userId);
  const clientId =
    process.env.AUTH_GITHUB_ID ?? process.env.GITHUB_APP_CLIENT_ID ?? "";
  const clientSecret =
    process.env.AUTH_GITHUB_SECRET ?? process.env.GITHUB_APP_CLIENT_SECRET ?? "";

  if (accessToken && clientId && clientSecret) {
    try {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const res = await fetch(
        `https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ access_token: accessToken }),
        },
      );
      if (!res.ok && res.status !== 404) {
        console.error(
          "[auth] revoke GitHub grant failed:",
          res.status,
          (await res.text()).slice(0, 300),
        );
      }
    } catch (err) {
      console.error("[auth] revoke GitHub grant error:", err);
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
    },
  });
  await prisma.account.updateMany({
    where: { userId, provider: "github" },
    data: {
      access_token: null,
      refresh_token: null,
      expires_at: null,
    },
  });
}
