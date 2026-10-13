import type { ScopeConfig } from "@/types/api";
import ignoreLib from "ignore";
import { isMarkdown } from "@/lib/translation/paths";

function pathMatchesInclude(path: string, includePaths: string[]): boolean {
  if (includePaths.length === 0) return isMarkdown(path);
  for (const p of includePaths) {
    const pat = p.replace(/^\.\//, "");
    if (pat.endsWith("/")) {
      if (path.startsWith(pat) || path === pat.slice(0, -1)) return true;
    } else if (pat.includes("*")) {
      const re = new RegExp(
        "^" + pat.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$",
      );
      if (re.test(path)) return true;
    } else if (path === pat) return true;
  }
  return false;
}

export function filterTranslatablePaths(
  allMdPaths: string[],
  scope: ScopeConfig,
  ignoreFileContent: string,
): string[] {
  const ig = ignoreLib().add(ignoreFileContent || "");
  return allMdPaths
    .filter(isMarkdown)
    .filter((p) => pathMatchesInclude(p, scope.includePaths))
    .filter((p) => !scope.excludePaths.includes(p))
    .filter((p) => !ig.ignores(p))
    .filter((p) => !p.startsWith("translations/"))
    .sort();
}
