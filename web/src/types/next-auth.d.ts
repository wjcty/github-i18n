import "next-auth";

declare module "next-auth" {
  interface Session {
    githubLogin?: string;
    emailVerified?: boolean;
  }
}
