import "@/lib/env";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { persistUserTokens, syncPrimaryEmail } from "@/lib/github/user-token";

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
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
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (dbUser) {
        session.githubLogin = dbUser.login;
        session.emailVerified = dbUser.emailVerified;
        if (dbUser.primaryEmail) session.user.email = dbUser.primaryEmail;
      }
      return session;
    },
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
