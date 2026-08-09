import { describe, expect, it } from "vitest";
import { buildCurlCommand, formatJsonBody, formatRequestPreview, redactSensitiveRequest } from "./requestFormatting";

describe("request formatting helpers", () => {
  it("formats JSON bodies and leaves invalid JSON untouched", () => {
    expect(formatJsonBody("{\"name\":\"Momo\"}")).toBe("{\n  \"name\": \"Momo\"\n}");
    expect(formatJsonBody("{")).toBe("{");
  });

  it("builds shell-safe curl previews from redacted requests", () => {
    expect(buildCurlCommand({
      method: "POST",
      url: "https://api.example.test/pets/pet 1",
      headers: {
        "content-type": "application/json",
        "x-note": "owner's pet"
      },
      body: "{\"name\":\"Momo\"}"
    })).toBe("curl -X POST 'https://api.example.test/pets/pet 1' -H 'content-type: application/json' -H 'x-note: owner'\\''s pet' --data-raw '{\"name\":\"Momo\"}'");
  });

  it("formats PowerShell and cmd commands", () => {
    const request = { method: "GET" as const, url: "https://example.test/a b", headers: { "x-note": "owner's" } };
    expect(buildCurlCommand(request, "powershell")).toBe("curl.exe -X GET 'https://example.test/a b' -H 'x-note: owner''s'");
    expect(buildCurlCommand(request, "cmd")).toBe('curl -X GET "https://example.test/a b" -H "x-note: owner\'s"');
  });

  it("redacts sensitive headers and query values", () => {
    expect(redactSensitiveRequest({
      method: "GET",
      url: "https://example.test/items?access_token=secret&view=full",
      headers: { authorization: "Bearer secret", cookie: "session=abc; theme=dark", accept: "application/json" }
    })).toEqual({
      method: "GET",
      url: "https://example.test/items?access_token=********&view=full",
      headers: { authorization: "Bearer ********", cookie: "session=********; theme=********", accept: "application/json" }
    });
  });

  it("renders empty request previews as blank strings", () => {
    expect(formatRequestPreview(null)).toBe("");
    expect(buildCurlCommand(null)).toBe("");
  });
});
