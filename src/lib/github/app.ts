import { createRequire } from "module";
import { fileURLToPath } from "url";
import { appUrl, githubAppSlug } from "@/lib/constants";
import { loadGitHubAppPrivateKey } from "@/lib/github/private-key";

const require = createRequire(
  typeof __filename !== "undefined"
    ? __filename
    : fileURLToPath(import.meta.url),
);

type AppInstance = {
  getInstallationOctokit: (installationId: number) => Promise<unknown>;
};

let appInstance: AppInstance | null = null;

export function getGitHubApp(): AppInstance {
  if (appInstance) return appInstance;
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error("GITHUB_APP_ID is required");
  }
  const { App } = require("octokit") as { App: new (opts: object) => AppInstance };
  const privateKey = loadGitHubAppPrivateKey();
  appInstance = new App({
    appId,
    privateKey,
    oauth: {
      clientId: process.env.GITHUB_APP_CLIENT_ID ?? process.env.AUTH_GITHUB_ID!,
      clientSecret:
        process.env.GITHUB_APP_CLIENT_SECRET ?? process.env.AUTH_GITHUB_SECRET!,
    },
  });
  return appInstance;
}

export async function getInstallationOctokit(installationId: number) {
  return getGitHubApp().getInstallationOctokit(installationId);
}

export function githubAppInstallUrl(): string {
  return `https://github.com/apps/${githubAppSlug()}/installations/new`;
}

export function metaAppPayload() {
  return {
    appName: "GitHub-i18n",
    githubAppInstallUrl: githubAppInstallUrl(),
    appUrl: appUrl(),
  };
}
