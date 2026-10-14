/** 以类似 Google 授权的小弹窗打开 GitHub App 安装页 */
export function openGitHubAppInstallPopup(url: string): Window | null {
  if (typeof window === "undefined" || !url) return null;
  const width = 920;
  const height = 740;
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - width) / 2),
  );
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - height) / 2),
  );
  // 不用 noopener，以便安装成功后由本页关闭该弹窗，并能检测用户是否手动关掉
  return window.open(
    url,
    "github-app-install",
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );
}

export function closeGitHubAppInstallPopup(popup: Window | null | undefined) {
  try {
    if (popup && !popup.closed) popup.close();
  } catch {
    /* ignore cross-origin / already closed */
  }
}

export function isGitHubAppInstallPopupClosed(
  popup: Window | null | undefined,
): boolean {
  if (!popup) return true;
  try {
    return popup.closed;
  } catch {
    return true;
  }
}

/** 安装引导 UI 状态：等待中 / 弹窗被拦 / 用户关掉了安装窗且尚未装好 */
export type InstallPopupPhase = "waiting" | "blocked" | "closed";
