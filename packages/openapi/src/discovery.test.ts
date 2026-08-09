import { afterEach, describe, expect, it, vi } from "vitest";
import { BasicOpenApiNormalizer, FetchOpenApiDiscoveryService } from "./index.js";
import { resolveExternalReferences } from "./refs.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("FetchOpenApiDiscoveryService external references", () => {
  it("resolves same-origin external references and their local fragments", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://api.example.test/openapi.json") return jsonResponse({
        openapi: "3.1.0",
        info: { title: "External API", version: "1" },
        paths: {
          "/pets": {
            post: {
              requestBody: { $ref: "./components/bodies.json#/PetBody" },
              responses: { "200": { description: "OK" } }
            }
          }
        }
      });
      if (url === "https://api.example.test/components/bodies.json") return jsonResponse({
        PetBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/Schemas/Pet" } } }
        },
        Schemas: { Pet: { type: "object", required: ["name"], properties: { name: { type: "string" } } } }
      });
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const discovered = await new FetchOpenApiDiscoveryService().fetch("https://api.example.test/openapi.json");
    const normalized = new BasicOpenApiNormalizer().normalize(discovered.document);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(normalized.operations[0]?.requestBodyMediaTypes[0]).toMatchObject({
      mediaType: "application/json",
      required: true,
      schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } }
    });
  });

  it("terminates circular external schemas", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => String(input).endsWith("openapi.json")
      ? jsonResponse({
          openapi: "3.1.0",
          info: { title: "Cycles", version: "1" },
          paths: { "/nodes": { post: { requestBody: { content: { "application/json": { schema: { $ref: "./schemas.json#/Node" } } } }, responses: { "200": { description: "OK" } } } } }
        })
      : jsonResponse({ Node: { type: "object", properties: { child: { $ref: "#/Node" } } } })));

    const discovered = await new FetchOpenApiDiscoveryService().fetch("https://api.example.test/openapi.json");
    const schema = new BasicOpenApiNormalizer().normalize(discovered.document).operations[0]?.requestBodySchema;
    expect(JSON.stringify(schema)).toContain("x-tapir-circular-ref");
  });

  it("blocks cross-origin and unsafe-scheme references before fetching them", async () => {
    const root = (reference: string) => jsonResponse({
      openapi: "3.0.3",
      info: { title: "Unsafe", version: "1" },
      paths: { "/pets": { get: { parameters: [{ $ref: reference }], responses: { "200": { description: "OK" } } } } }
    });
    const fetchMock = vi.fn(async () => root("https://other.example.test/parameters.json#/PetId"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new FetchOpenApiDiscoveryService().fetch("https://api.example.test/openapi.json")).rejects.toThrow("only resolves same-origin references");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(root("file:///etc/passwd"));
    await expect(new FetchOpenApiDiscoveryService().fetch("https://api.example.test/openapi.json")).rejects.toThrow("unsafe scheme file:");
  });

  it("enforces external document size limits", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => String(input).endsWith("openapi.json")
      ? jsonResponse({
          openapi: "3.0.3",
          info: { title: "Large", version: "1" },
          paths: { "/pets": { get: { parameters: [{ $ref: "./parameters.json#/PetId" }], responses: { "200": { description: "OK" } } } } }
        })
      : new Response("{}", { status: 200, headers: { "content-length": String(2 * 1024 * 1024 + 1) } })));

    await expect(new FetchOpenApiDiscoveryService().fetch("https://api.example.test/openapi.json")).rejects.toThrow("External OpenAPI reference exceeds Tapir's 2 MB limit");
  });

  it("enforces reference depth and document-count limits", async () => {
    const localChain = { first: { $ref: "#/second" }, second: { $ref: "#/third" }, third: { $ref: "#/fourth" }, fourth: { type: "string" } };
    await expect(resolveExternalReferences(localChain, "https://api.example.test/openapi.json", async () => ({}), {
      maxDepth: 2,
      maxDocuments: 16,
      requireSameOrigin: true
    })).rejects.toThrow("reference depth exceeds Tapir's limit of 2");

    const root = { $ref: "./1.json#/value" };
    await expect(resolveExternalReferences(root, "https://api.example.test/openapi.json", async (url) => {
      const index = Number(new URL(url).pathname.match(/\/(\d+)\.json$/)?.[1]);
      return { value: { $ref: `./${index + 1}.json#/value` } };
    }, { maxDepth: 100, maxDocuments: 3, requireSameOrigin: true })).rejects.toThrow("limit of 3 documents");
  });

  it("aborts discovery requests after the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })));

    const result = expect(new FetchOpenApiDiscoveryService().fetch("https://api.example.test/openapi.json")).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
