import { describe, expect, it } from "vitest";
import { assertTrustedRendererUrl, isTrustedRendererUrl, validateDevRendererUrl } from "./ipcSecurity";

describe("desktop IPC renderer trust", () => {
  it("allows only the exact renderer URL assigned to the window", () => {
    expect(isTrustedRendererUrl("file:///C:/Tapir/out/renderer/index.html", "file:///C:/Tapir/out/renderer/index.html")).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5173/", "http://localhost:5173/")).toBe(true);
  });

  it("blocks lookalike local files, changed paths, and missing renderer URLs", () => {
    const expected = "file:///C:/Tapir/out/renderer/index.html";
    expect(isTrustedRendererUrl("file:///C:/Temp/renderer/index.html", expected)).toBe(false);
    expect(isTrustedRendererUrl("file:///C:/Tapir/out/renderer/other.html", expected)).toBe(false);
    expect(() => assertTrustedRendererUrl(undefined, expected)).toThrow("Blocked IPC call from an untrusted renderer.");
    expect(() => assertTrustedRendererUrl("file:///C:/Temp/renderer/index.html", expected)).toThrow("Blocked IPC call from an untrusted renderer.");
  });

  it("validates the optional development renderer URL", () => {
    expect(validateDevRendererUrl("http://localhost:5173", false)).toBe("http://localhost:5173/");
    expect(() => validateDevRendererUrl("https://example.test", false)).toThrow("local development server");
    expect(() => validateDevRendererUrl("http://localhost:5173", true)).toThrow("local development server");
  });
});
