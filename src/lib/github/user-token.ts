import { Octokit } from "octokit";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

export async function getUserAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.encryptedAccessToken) {
    return decrypt(user.encryptedAccessToken);
  }
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
  });
  return account?.access_token ?? null;
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
