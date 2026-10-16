import "@/lib/env";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  persistUserTokens,
  revokeGitHubAppAuthorization,
  syncPrimaryEmail,
} from "@/lib/github/user-token";

const githubClientId =
  process.env.AUTH_GITHUB_ID ?? process.env.GITHUB_APP_CLIENT_ID ?? "";
const githubClientSecret =
  process.env.AUTH_GITHUB_SECRET ?? process.env.GITHUB_APP_CLIENT_SECRET ?? "";

if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
  throw new Error(
    "AUTH_SECRET or NEXTAUTH_SECRET is required. Set it in the backend .env file.",
  );
}

if (!githubClientId || !githubClientSecret) {
  throw new Error(
    "GitHub OAuth client id/secret missing. Set AUTH_GITHUB_ID / AUTH_GITHUB_SECRET or GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET.",
  );
}

function toAdapterUser(user: User): AdapterUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? user.primaryEmail ?? "",
    image: user.image ?? user.avatarUrl,
    emailVerified: user.emailVerified ? new Date() : null,
  };
}

const prismaAdapter = PrismaAdapter(prisma);

const adapter: Adapter = {
  ...prismaAdapter,
  async createUser(data) {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        image: data.image,
        emailVerified: Boolean(data.emailVerified),
        login: data.name ?? data.email?.split("@")[0] ?? "user",
        avatarUrl: data.image,
        primaryEmail: data.email,
      },
    });
    return toAdapterUser(user);
  },
  async getUser(id) {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? toAdapterUser(user) : null;
  },
  async getUserByEmail(email) {
    if (!email) return null;
    const user = await prisma.user.findFirst({
      where: { OR: [{ email }, { primaryEmail: email }] },
    });
    return user ? toAdapterUser(user) : null;
  },
  async updateUser(data) {
    const user = await prisma.user.update({
      where: { id: data.id },
      data: {
        name: data.name,
        email: data.email,
        image: data.image,
        emailVerified:
          data.emailVerified === undefined
            ? undefined
            : Boolean(data.emailVerified),
        avatarUrl: data.image,
        primaryEmail: data.email,
      },
    });
    return toAdapterUser(user);
  },
  async getSessionAndUser(sessionToken) {
    const result = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });
    if (!result) return null;
    const { user, ...session } = result;
    return { user: toAdapterUser(user), session };
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      // 前后端分离反代时 PKCE Cookie 易丢失，GitHub App 用 state 即可
      checks: ["state"],
      authorization: { params: { scope: "read:user user:email" } },
    }),
  ],
  events: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "github" || !user.id) return;
      const login =
        (profile as { login?: string })?.login ?? user.name ?? account.providerAccountId;

      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            githubId: account.providerAccountId,
            login,
            name: user.name,
            avatarUrl: user.image,
            image: user.image,
            email: user.email,
          },
        });

        const settings = await prisma.userSettings.findUnique({
          where: { userId: user.id },
        });
        if (!settings) {
          await prisma.userSettings.create({ data: { userId: user.id } });
        }

        if (account.access_token) {
          await persistUserTokens(
            user.id,
            account.access_token,
            account.refresh_token,
            account.expires_at,
          );
        }
        await syncPrimaryEmail(user.id);
      } catch (err) {
        console.error("[auth] signIn event failed:", err);
      }
    },
    async signOut(message) {
      const userId =
        "session" in message && message.session && "userId" in message.session
          ? (message.session as { userId?: string }).userId
          : undefined;
      if (!userId) return;
      try {
        await revokeGitHubAppAuthorization(userId);
      } catch (err) {
        console.error("[auth] signOut revoke failed:", err);
      }
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (dbUser) {
        session.githubLogin = dbUser.login;
        session.emailVerified = dbUser.emailVerified;
        if (dbUser.primaryEmail) session.user.email = dbUser.primaryEmail;
        if (dbUser.name) session.user.name = dbUser.name;
        session.user.image = dbUser.image ?? dbUser.avatarUrl ?? session.user.image;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  session: { strategy: "database" },
  trustHost: true,
  debug: process.env.AUTH_DEBUG === "1",
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    githubLogin?: string;
    emailVerified?: boolean;
  }
}
