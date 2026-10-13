export function installationAccountLogin(account: unknown): string {
  if (!account || typeof account !== "object") return "unknown";
  const a = account as Record<string, unknown>;
  if (typeof a.login === "string" && a.login) return a.login;
  if (typeof a.slug === "string" && a.slug) return a.slug;
  if (typeof a.name === "string" && a.name) return a.name;
  return "unknown";
}

export function installationAccountType(account: unknown): string {
  if (!account || typeof account !== "object") return "User";
  const a = account as Record<string, unknown>;
  return typeof a.type === "string" ? a.type : "User";
}
