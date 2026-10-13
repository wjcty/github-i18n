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
