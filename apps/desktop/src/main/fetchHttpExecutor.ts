import type { HttpExecutor, PreparedRequest } from "@tapir/core";

const requestTimeoutMs = 30_000;
const maxResponseBodyBytes = 10 * 1024 * 1024;

export class FetchHttpExecutor implements HttpExecutor {
  async execute(request: PreparedRequest) {
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const requestHeaders = { ...request.headers };
      const fetchBody = prepareFetchBody(request, requestHeaders);
      const response = await fetch(request.url, {
        method: request.method,
        headers: requestHeaders,
        body: fetchBody,
        signal: controller.signal
      });
      const body = await readLimitedText(response, maxResponseBodyBytes, "Response body");
      const headers = Object.fromEntries(response.headers.entries());
      return {
        status: response.status,
        headers,
        body,
        durationMs: Math.round(performance.now() - started)
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function prepareFetchBody(request: PreparedRequest, headers: Record<string, string>): string | FormData | undefined {
  if (request.bodyEncoding !== "multipart-json" || !request.body) return request.body;
  const parsed = JSON.parse(request.body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Multipart body must be a JSON object.");
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === "content-type") delete headers[name];
  }
  const form = new FormData();
  for (const [key, item] of Object.entries(parsed)) {
    const values = Array.isArray(item) ? item : [item];
    for (const value of values) {
      if (value === undefined || value === null) continue;
      form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  }
  return form;
}

async function readLimitedText(response: Response, maxBytes: number, label: string): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`${label} exceeds Tapir's ${formatBytes(maxBytes)} limit.`);
  }
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`${label} exceeds Tapir's ${formatBytes(maxBytes)} limit.`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function formatBytes(value: number): string {
  return `${Math.round(value / 1024 / 1024)} MB`;
}
