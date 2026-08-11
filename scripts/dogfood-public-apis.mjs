import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BasicOpenApiNormalizer, FetchOpenApiDiscoveryService } from "@tapir/openapi";
import { prepareCustomRequest, prepareOperationRequest } from "@tapir/core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const outputPath = join(artifactsDir, "dogfood-public-apis.json");
const discovery = new FetchOpenApiDiscoveryService();
const normalizer = new BasicOpenApiNormalizer();
const cases = [
  {
    name: "Swagger Petstore 3",
    baseUrl: "https://petstore3.swagger.io/api/v3",
    discovery: "automatic",
    operation: { method: "GET", path: "/pet/findByStatus", values: { status: "available" }, statuses: [200] }
  },
  {
    name: "Scalar Galaxy",
    baseUrl: "https://galaxy.scalar.com",
    discovery: "automatic",
    operation: { method: "GET", path: "/planets", values: { limit: "2", offset: "0" }, statuses: [200] }
  },
  {
    name: "Cubbie Public API",
    baseUrl: "https://www.cubbie.com",
    discoveryBaseUrl: "https://www.cubbie.com/api/v1",
    discovery: "automatic",
    operation: { method: "GET", path: "/api/v1/health", values: {}, statuses: [200], externalStatuses: [403] }
  },
  {
    name: "GitHub REST API",
    baseUrl: "https://api.github.com",
    specUrl: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    discovery: "explicit",
    operation: { method: "GET", path: "/meta", values: {}, statuses: [200], headers: { accept: "application/vnd.github+json" } }
  },
  {
    name: "OpenAI API",
    baseUrl: "https://api.openai.com/v1",
    specUrl: "https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.json",
    discovery: "explicit"
  },
  {
    name: "Stripe API JSON",
    baseUrl: "https://api.stripe.com",
    specUrl: "https://raw.githubusercontent.com/stripe/openapi/master/latest/openapi.spec3.json",
    discovery: "explicit"
  },
  {
    name: "httpbin Swagger 2.0",
    baseUrl: "https://httpbin.org",
    specUrl: "https://httpbin.org/spec.json",
    discovery: "explicit",
    expectedFailure: /Swagger 2\.0 is not supported/
  },
  {
    name: "Stripe YAML specification",
    baseUrl: "https://api.stripe.com",
    specUrl: "https://raw.githubusercontent.com/stripe/openapi/master/latest/openapi.spec3.yaml",
    discovery: "explicit",
    expectedFailure: /Tapir currently supports JSON documents only/
  },
  {
    name: "Kubernetes Swagger specification",
    baseUrl: "https://kubernetes.example.invalid",
    specUrl: "https://raw.githubusercontent.com/kubernetes/kubernetes/master/api/openapi-spec/swagger.json",
    discovery: "explicit",
    expectedFailure: /exceeds Tapir's 20 MB limit|Swagger 2\.0 is not supported/
  }
];

const results = [];
for (const testCase of cases) {
  const started = performance.now();
  try {
    const discovered = testCase.specUrl
      ? await discovery.fetch(testCase.specUrl)
      : await discovery.discover(testCase.discoveryBaseUrl ?? testCase.baseUrl);
    const normalized = normalizer.normalize(discovered.document);
    const result = {
      name: testCase.name,
      outcome: "passed",
      discovery: testCase.discovery,
      specUrl: discovered.specUrl,
      openApiVersion: normalized.version,
      operations: normalized.operations.length,
      diagnostics: normalized.diagnostics ?? []
    };

    if (testCase.expectedFailure) {
      throw new Error(`Expected this compatibility case to fail, but it normalized ${normalized.operations.length} operations.`);
    }
    if (testCase.operation) {
      result.request = await exerciseOperation(testCase, normalized.operations);
      if (result.request.externalLimitation) result.outcome = "external-limitation";
    }
    result.durationMs = Math.round(performance.now() - started);
    results.push(result);
    console.log(`${result.outcome === "external-limitation" ? "LIMIT" : "PASS"} ${testCase.name} (${result.operations} operations${result.request ? `, HTTP ${result.request.status}` : ""})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const expected = Boolean(testCase.expectedFailure?.test(message));
    results.push({
      name: testCase.name,
      outcome: expected ? "expected-failure" : "failed",
      discovery: testCase.discovery,
      error: message,
      durationMs: Math.round(performance.now() - started)
    });
    console.log(`${expected ? "PASS" : "FAIL"} ${testCase.name}: ${message}`);
  }
}

const customRequestCases = [
  {
    name: "httpbin custom GET echo",
    request: {
      method: "GET",
      url: "https://httpbin.org/anything/tapir",
      parameters: [{ id: "query-1", name: "filter", in: "query", value: "alpha,beta", enabled: true, source: "custom" }],
      headers: [{ id: "header-1", name: "x-tapir-dogfood", value: "yes", enabled: true }]
    },
    statuses: [200],
    verify(body) {
      const parsed = JSON.parse(body);
      if (parsed.args?.filter !== "alpha,beta") throw new Error("Echoed query parameter did not preserve its comma.");
      if (parsed.headers?.["X-Tapir-Dogfood"] !== "yes") throw new Error("Echoed custom header is missing.");
    }
  },
  {
    name: "httpbin custom JSON POST",
    request: {
      method: "POST",
      url: "https://httpbin.org/anything",
      parameters: [],
      headers: [],
      body: JSON.stringify({ tapir: true, count: 2 }),
      contentType: "application/json"
    },
    statuses: [200],
    verify(body) {
      const parsed = JSON.parse(body);
      if (parsed.json?.tapir !== true || parsed.json?.count !== 2) throw new Error("Echoed JSON body does not match the prepared body.");
    }
  },
  {
    name: "httpbin manual redirect",
    request: { method: "GET", url: "https://httpbin.org/redirect/1", parameters: [], headers: [] },
    statuses: [302]
  },
  {
    name: "httpbin non-success response",
    request: { method: "GET", url: "https://httpbin.org/status/418", parameters: [], headers: [] },
    statuses: [418]
  }
];

for (const testCase of customRequestCases) {
  const started = performance.now();
  try {
    const prepared = prepareCustomRequest(testCase.request);
    if (prepared.validationIssues.length > 0) {
      throw new Error(`Prepared request has validation issues: ${prepared.validationIssues.map((issue) => issue.message).join("; ")}`);
    }
    const response = await fetch(prepared.request.url, {
      method: prepared.request.method,
      headers: prepared.request.headers,
      body: prepared.request.body,
      redirect: "manual"
    });
    const body = await response.text();
    if (!testCase.statuses.includes(response.status)) throw new Error(`Unexpected HTTP ${response.status}.`);
    testCase.verify?.(body);
    results.push({ name: testCase.name, kind: "custom-request", outcome: "passed", status: response.status, durationMs: Math.round(performance.now() - started) });
    console.log(`PASS ${testCase.name} (HTTP ${response.status})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name: testCase.name, kind: "custom-request", outcome: "failed", error: message, durationMs: Math.round(performance.now() - started) });
    console.log(`FAIL ${testCase.name}: ${message}`);
  }
}

const report = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  summary: {
    total: results.length,
    passed: results.filter((result) => result.outcome === "passed").length,
    externalLimitations: results.filter((result) => result.outcome === "external-limitation").length,
    expectedFailures: results.filter((result) => result.outcome === "expected-failure").length,
    failed: results.filter((result) => result.outcome === "failed").length
  },
  results
};
await mkdir(artifactsDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Dogfood report: ${outputPath}`);
if (report.summary.failed > 0) process.exitCode = 1;

async function exerciseOperation(testCase, operations) {
  const definition = testCase.operation;
  const operation = operations.find((candidate) => candidate.method === definition.method && candidate.path === definition.path);
  if (!operation) throw new Error(`Normalized operation not found: ${definition.method} ${definition.path}.`);
  const prepared = prepareOperationRequest(testCase.baseUrl, { operation, values: definition.values });
  if (prepared.validationIssues.length > 0) {
    throw new Error(`Prepared request has validation issues: ${prepared.validationIssues.map((issue) => issue.message).join("; ")}`);
  }
  const response = await fetch(prepared.request.url, {
    method: prepared.request.method,
    headers: { ...prepared.request.headers, ...definition.headers },
    body: prepared.request.body,
    redirect: "manual"
  });
  const body = await response.text();
  if (definition.externalStatuses?.includes(response.status)) {
    return {
      operationId: operation.operationId,
      method: prepared.request.method,
      url: prepared.request.url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      responseCharacters: body.length,
      externalLimitation: true
    };
  }
  if (!definition.statuses.includes(response.status)) {
    throw new Error(`Unexpected HTTP ${response.status} from ${prepared.request.url}: ${body.slice(0, 200)}`);
  }
  return {
    operationId: operation.operationId,
    method: prepared.request.method,
    url: prepared.request.url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    responseCharacters: body.length
  };
}
