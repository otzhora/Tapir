import { describe, expect, it } from "vitest";
import { buildCurlCommand, formatJsonBody, formatRequestPreview } from "./requestFormatting";

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
    })).toBe("curl -X POST 'https://api.example.test/pets/pet 1' -H 'content-type: application/json' -H 'x-note: owner'\\''s pet' --data '{\"name\":\"Momo\"}'");
  });

  it("renders empty request previews as blank strings", () => {
    expect(formatRequestPreview(null)).toBe("");
    expect(buildCurlCommand(null)).toBe("");
  });
});
