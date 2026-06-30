import type { HttpExecutor, PreparedRequest } from "@tapir/core";

export class FetchHttpExecutor implements HttpExecutor {
  async execute(request: PreparedRequest) {
    const started = performance.now();
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    return {
      status: response.status,
      headers,
      body,
      durationMs: Math.round(performance.now() - started)
    };
  }
}
