import { describe, expect, it } from "vitest";
import { parseCurlCommand, redirectCurlUrl } from "./curlImport";

const clean = { includeBrowserHeaders: false, includeSensitiveHeaders: false };

describe("cURL import", () => {
  it("parses a Chrome-style request and removes browser and sensitive headers by default", () => {
    const parsed = parseCurlCommand(`curl 'https://dev.example.test/api/orders?expand=items' \\
      -H 'accept: application/json' \\
      -H 'authorization: Bearer secret' \\
      -H 'sec-fetch-mode: cors' \\
      -H 'content-type: application/json' \\
      --data-raw '{"name":"Momo'\\''s order"}'`, clean);

    expect(parsed).toMatchObject({
      method: "POST",
      url: "https://dev.example.test/api/orders?expand=items",
      body: `{"name":"Momo's order"}`,
      contentType: "application/json",
      browserHeaderCount: 1,
      sensitiveHeaderCount: 1
    });
    expect(parsed.headers.map((header) => header.name)).toEqual(["accept", "content-type"]);
  });

  it("supports double-quoted Windows commands and explicit methods", () => {
    const parsed = parseCurlCommand('curl.exe "https://dev.example.test/items" ^\n  -X PATCH ^\n  -H "x-api-key: secret" ^\n  --data "{\\"enabled\\":true}"', {
      includeBrowserHeaders: true,
      includeSensitiveHeaders: true
    });
    expect(parsed).toMatchObject({ method: "PATCH", body: '{"enabled":true}' });
    expect(parsed.headers[0]).toMatchObject({ name: "x-api-key", value: "secret" });
  });

  it("rejects unsupported file-backed bodies", () => {
    expect(() => parseCurlCommand("curl https://example.test --data-binary @body.json", clean)).toThrow("File-backed");
  });

  it("replaces only the destination origin", () => {
    expect(redirectCurlUrl("https://dev.example.test/api/orders?q=one#part", "localhost:5051/api"))
      .toBe("http://localhost:5051/api/orders?q=one#part");
  });
});
