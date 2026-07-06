import { describe, expect, it } from "vitest";
import type { NormalizedOperation } from "@tapir/core";
import { parseHeaders, parseRequestSnapshot, restoreRequestInputs } from "./historyRestore";

describe("history restore helpers", () => {
  it("restores path, query, header, body, and content type values for the request UI", () => {
    const restored = restoreRequestInputs(operation, {
      method: "POST",
      url: "https://api.example.test/pets/pet%201?include=owner&include=visits",
      headers: { "content-type": "application/json", "x-trace-id": "trace-1" },
      body: "{\"name\":\"Momo\"}"
    }, "text/plain");

    expect(restored).toEqual({
      parameterValues: {
        petId: "pet 1",
        include: "owner, visits",
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
});

const operation: NormalizedOperation = {
  operationId: "updatePet",
  method: "POST",
  path: "/pets/{petId}",
  tags: ["Pets"],
  parameters: [
    { name: "petId", in: "path", required: true },
    { name: "include", in: "query", required: false },
    { name: "x-trace-id", in: "header", required: false }
  ],
  requestBodyMediaTypes: [{ mediaType: "application/json" }],
  securityRequirements: [],
  securitySchemes: []
};
