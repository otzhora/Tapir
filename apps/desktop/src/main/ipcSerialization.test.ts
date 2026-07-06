import { describe, expect, it } from "vitest";
import { toIpcPayload } from "./ipcSerialization";

describe("toIpcPayload", () => {
  it("returns undefined unchanged for void IPC responses", () => {
    expect(toIpcPayload(undefined)).toBeUndefined();
  });

  it("returns a JSON-safe clone for Electron IPC", () => {
    const value = {
      id: "response-1",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      nested: { ok: true },
      method() {
        return "not serializable";
      }
    };

    expect(toIpcPayload(value)).toEqual({
      id: "response-1",
      createdAt: "2026-07-01T00:00:00.000Z",
      nested: { ok: true }
    });
  });
});
