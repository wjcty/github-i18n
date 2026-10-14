import type { Octokit } from "octokit";
import { appUrl, githubAppSlug } from "@/lib/constants";
import { loadGitHubAppPrivateKey } from "@/lib/github/private-key";

type GitHubApp = {
  octokit: {
    rest: {
      apps: {
        getAuthenticated: () => Promise<{ data: { slug?: string } }>;
      };
    };
  };
  getInstallationOctokit: (installationId: number) => Promise<Octokit>;
};

let appInstance: GitHubApp | null = null;
let appPromise: Promise<GitHubApp> | null = null;
let slugCache: string | null = null;

/**
 * octokit@4 是纯 ESM。tsx 把 worker 编成 CJS 后 require() 会失败，
 * 必须用动态 import() 才能在 Next.js 与 worker 两边都加载 App。
 */
export async function getGitHubApp(): Promise<GitHubApp> {
  if (appInstance) return appInstance;
  if (!appPromise) {
    appPromise = (async () => {
      const { App } = await import("octokit");
      const appId = process.env.GITHUB_APP_ID;
      if (!appId) {
        throw new Error("GITHUB_APP_ID is required");
      }
      const privateKey = loadGitHubAppPrivateKey();
      appInstance = new App({
        appId,
        privateKey,
        oauth: {
          clientId: process.env.GITHUB_APP_CLIENT_ID ?? process.env.AUTH_GITHUB_ID!,
          clientSecret:
            process.env.GITHUB_APP_CLIENT_SECRET ?? process.env.AUTH_GITHUB_SECRET!,
        },
      }) as GitHubApp;
      return appInstance;
    })();
  }
  return appPromise;
}

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const app = await getGitHubApp();
  return app.getInstallationOctokit(installationId);
}

export async function resolveGitHubAppSlug(): Promise<string> {
  const fromEnv = process.env.GITHUB_APP_SLUG;
  if (fromEnv) return fromEnv;
  if (slugCache) return slugCache;
  try {
    const app = await getGitHubApp();
    const { data } = await app.octokit.rest.apps.getAuthenticated();
    if (data.slug) {
      slugCache = data.slug;
      return data.slug;
    }
  } catch (err) {
    console.error("[github-app] failed to resolve slug:", err);
  }
  return githubAppSlug();
}

export async function githubAppInstallUrl(): Promise<string> {
  const slug = await resolveGitHubAppSlug();
  return `https://github.com/apps/${slug}/installations/new`;
}

export async function metaAppPayload() {
  return {
    appName: "GitHub-i18n",
    githubAppInstallUrl: await githubAppInstallUrl(),
    appUrl: appUrl(),
  };
}
