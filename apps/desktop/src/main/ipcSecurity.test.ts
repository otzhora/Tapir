import { describe, expect, it } from "vitest";
import { assertTrustedRendererUrl, isTrustedRendererUrl, validateDevRendererUrl } from "./ipcSecurity";

describe("desktop IPC renderer trust", () => {
  it("allows packaged renderer files and local development servers", () => {
    expect(isTrustedRendererUrl("file:///C:/Tapir/out/renderer/index.html", true)).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5173/", false)).toBe(true);
    expect(isTrustedRendererUrl("https://127.0.0.1:5173/", false)).toBe(true);
  });

  it("blocks remote renderer origins and local dev URLs in packaged builds", () => {
    expect(isTrustedRendererUrl("https://example.test/renderer/index.html", false)).toBe(false);
    expect(isTrustedRendererUrl("http://localhost:5173/", true)).toBe(false);
    expect(() => assertTrustedRendererUrl(undefined, false)).toThrow("Blocked IPC call from an untrusted renderer.");
    expect(() => assertTrustedRendererUrl("https://example.test/", false)).toThrow("Blocked IPC call from an untrusted renderer.");
  });

  it("validates the optional development renderer URL", () => {
    expect(validateDevRendererUrl("http://localhost:5173", false)).toBe("http://localhost:5173/");
    expect(() => validateDevRendererUrl("https://example.test", false)).toThrow("local development server");
    expect(() => validateDevRendererUrl("http://localhost:5173", true)).toThrow("local development server");
  });
});
