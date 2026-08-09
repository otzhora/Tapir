import { describe, expect, it, vi } from "vitest";
import { FetchHttpExecutor } from "./fetchHttpExecutor";

describe("FetchHttpExecutor", () => {
  it("sends prepared requests and captures response snapshots", async () => {
    const fetchMock = vi.fn(async () => new Response("{\"ok\":true}", {
      status: 201,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await new FetchHttpExecutor().execute({
      method: "POST",
      url: "https://api.example.test/pets",
      headers: { "content-type": "application/json", "x-api-key": "secret" },
      body: "{\"name\":\"Momo\"}"
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/pets", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "secret" },
      body: "{\"name\":\"Momo\"}",
      signal: expect.any(AbortSignal)
    }));
    expect(response).toMatchObject({
      status: 201,
      headers: { "content-type": "application/json" },
      body: "{\"ok\":true}"
    });
    expect(response.durationMs).toEqual(expect.any(Number));
  });

  it("rejects responses whose declared content length exceeds the desktop limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("too large", {
      status: 200,
      headers: { "content-length": String(10 * 1024 * 1024 + 1) }
    })));

    await expect(new FetchHttpExecutor().execute({
      method: "GET",
      url: "https://api.example.test/large",
      headers: {}
    })).rejects.toThrow("Response body exceeds Tapir's 10 MB limit.");
  });

  it("converts structured multipart bodies to FormData and lets fetch set the boundary", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await new FetchHttpExecutor().execute({
      method: "POST",
      url: "https://api.example.test/upload",
      headers: { "content-type": "multipart/form-data", "x-trace-id": "trace-1" },
      body: JSON.stringify({ name: "Momo", tags: ["quiet", "friendly"] }),
      bodyEncoding: "multipart-json"
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual({ "x-trace-id": "trace-1" });
    expect(init.body).toBeInstanceOf(FormData);
    expect(Array.from((init.body as FormData).entries())).toEqual([
      ["name", "Momo"], ["tags", "quiet"], ["tags", "friendly"]
    ]);
  });
});
