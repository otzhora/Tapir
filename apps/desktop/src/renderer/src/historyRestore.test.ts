import { describe, expect, it } from "vitest";
import type { NormalizedOperation } from "@tapir/core";
import { parseHeaders, parseRequestSnapshot, restoreRequestInputs } from "./historyRestore";

describe("history restore helpers", () => {
  it("restores path, query, header, cookie, body, and content type values for the request UI", () => {
    const restored = restoreRequestInputs(operation, {
      method: "POST",
      url: "https://api.example.test/pets/pet%201?include=owner&include=visits",
      headers: { "content-type": "application/json", "x-trace-id": "trace-1", cookie: "session=abc%20123" },
      body: "{\"name\":\"Momo\"}"
    }, "text/plain");

    expect(restored).toEqual({
      parameterValues: {
        petId: "pet 1",
        include: "owner, visits",
        session: "abc 123",
        "x-trace-id": "trace-1"
      },
      bodyValue: "{\"name\":\"Momo\"}",
      contentType: "application/json"
    });
  });

  it("falls back safely when persisted history JSON is invalid", () => {
    expect(parseRequestSnapshot("{")).toEqual({ method: "GET", url: "", headers: {} });
    expect(parseHeaders("{")).toEqual({});
  });

  it("restores serialized object and deep-object parameters as editable JSON", () => {
    const objectOperation: NormalizedOperation = {
      ...operation,
      method: "GET",
      path: "/reports/{coordinates}",
      parameters: [
        { name: "coordinates", in: "path", required: true, style: "matrix", explode: true, schema: { type: "object" } },
        { name: "filter", in: "query", required: false, style: "deepObject", explode: true, schema: { type: "object" } },
        { name: "x-options", in: "header", required: false, style: "simple", explode: true, schema: { type: "object" } },
        { name: "preferences", in: "cookie", required: false, style: "form", explode: false, schema: { type: "object" } }
      ]
    };
    const restored = restoreRequestInputs(objectOperation, {
      method: "GET",
      url: "https://api.example.test/reports/;latitude=10;longitude=20?filter%5Bstatus%5D=active&filter%5Bowner%5D%5Bid%5D=7&filter%5Btags%5D%5B%5D=a&filter%5Btags%5D%5B%5D=b",
      headers: { "x-options": "trace=true,region=eu", cookie: "preferences=theme%2Cdark%2Cdensity%2Ccompact" }
    }, "application/json");

    expect(restored.parameterValues).toEqual({
      coordinates: JSON.stringify({ latitude: "10", longitude: "20" }),
      filter: JSON.stringify({ status: "active", owner: { id: "7" }, tags: ["a", "b"] }),
      "x-options": JSON.stringify({ trace: "true", region: "eu" }),
      preferences: JSON.stringify({ theme: "dark", density: "compact" })
    });
  });
});

const operation: NormalizedOperation = {
  operationId: "updatePet",
  method: "POST",
  path: "/pets/{petId}",
  tags: ["Pets"],
  parameters: [
    { name: "petId", in: "path", required: true },
    { name: "include", in: "query", required: false },
    { name: "x-trace-id", in: "header", required: false },
    { name: "session", in: "cookie", required: false }
  ],
  requestBodyMediaTypes: [{ mediaType: "application/json" }],
  securityRequirements: [],
  securitySchemes: []
};
