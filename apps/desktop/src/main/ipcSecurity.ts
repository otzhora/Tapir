export function validateDevRendererUrl(value: string, isPackaged: boolean): string {
  if (!isPackaged) {
    const url = new URL(value);
    const isLocal = isLocalHostname(url.hostname) && (url.protocol === "http:" || url.protocol === "https:");
    if (isLocal) return url.toString();
  }
  throw new Error("ELECTRON_RENDERER_URL must point to a local development server.");
}

export function assertTrustedRendererUrl(value: string | undefined, isPackaged: boolean): void {
  if (!value) throw new Error("Blocked IPC call from an untrusted renderer.");
  if (isTrustedRendererUrl(value, isPackaged)) return;
  throw new Error("Blocked IPC call from an untrusted renderer.");
}

export function isTrustedRendererUrl(value: string, isPackaged: boolean): boolean {
  const url = new URL(value);
  if (url.protocol === "file:" && url.pathname.endsWith("/renderer/index.html")) return true;
  if (!isPackaged && isLocalHostname(url.hostname)) {
    return url.protocol === "http:" || url.protocol === "https:";
  }
  return false;
}

function isLocalHostname(value: string): boolean {
  return value === "localhost" || value === "127.0.0.1" || value === "[::1]";
}
