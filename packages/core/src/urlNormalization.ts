export function normalizeServerBaseUrl(value: string): string {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
