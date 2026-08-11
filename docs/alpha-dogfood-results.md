# Alpha Dogfood Results

## 2026-08-12 autonomous technical pass

The public compatibility suite completed with zero unexpected failures across 13 scenarios: nine specification/API cases and four standalone custom-request cases. One live request was classified as an external limitation because Cubbie's Cloudflare challenge returned HTML with HTTP 403 to the non-browser client.

| Target | Coverage | Result |
| --- | --- | --- |
| Swagger Petstore 3 | Path-aware automatic discovery, 19 operations, array query preparation, live GET | Passed, HTTP 200 |
| Scalar Galaxy | OpenAPI 3.1 features, circular schemas, diagnostics, 10 operations, live GET | Passed, HTTP 200 |
| Cubbie Public API | Nested-path discovery and normalization of 34 operations | Normalized; live health call blocked externally by Cloudflare HTTP 403 |
| GitHub REST API | Explicit 12.9 MB document, 1,220 operations, live public metadata request | Passed, HTTP 200 |
| OpenAI API | Explicit OpenAPI 3.1 document, 288 operations, unsupported-file diagnostics | Passed normalization |
| Stripe API JSON | Explicit 4.5 MB recursive document, 621 operations, form/parameter diagnostics | Passed normalization |
| httpbin Swagger 2.0 | Actionable compatibility rejection | Passed expected rejection |
| Stripe YAML | Actionable JSON-only compatibility rejection | Passed expected rejection |
| Kubernetes Swagger 2.0 | Large legacy document and actionable compatibility rejection | Passed expected rejection |
| httpbin custom requests | Scalar comma query, custom header, JSON POST, manual redirect, HTTP 418 body | Passed all four requests |

The full application-service pass imported GitHub's 1,220-operation document, persisted it to SQLite, executed `GET /meta`, recorded a standalone HTTP 418 request, restarted storage and the application service, and restored the definition plus both history entries. The temporary database was 10,678,272 bytes and the full service scenario completed in 1,876 ms on the test machine.

## Defects found and fixed

1. Discovery discarded the path portion of API base URLs, preventing automatic discovery of documents such as Petstore's `/api/v3/openapi.json`.
2. A server could not be created with an explicit specification URL when the document was hosted separately from the API.
3. The 5 MB root-document limit rejected GitHub's official 12.9 MB OpenAPI document. The bounded root limit is now 20 MB; external-reference limits remain unchanged.
4. Malformed or YAML documents surfaced raw JSON parser errors. They now receive a direct JSON-only compatibility message.
5. Eager expansion of every local response schema caused Stripe normalization to exceed a 4 GB JavaScript heap. Root-local references are preserved through discovery and nested response schemas remain referenced for display; request-authoring schemas continue to resolve on demand.
6. The local-reference cache could re-enter cached cyclic targets without marking them active.
7. Standalone custom query parameters split every comma into repeated values. Custom rows now remain scalar; users can create repeated parameters as repeated rows.

Regression coverage now includes path-aware discovery, explicit specification IPC/service/UI flow, nested external references behind local components, root size and JSON diagnostics, cached local cycles, referenced response schemas, scalar custom commas, and rendering a 1,220-operation catalog.

## Remaining human and external coverage

- Use genuine API-key, bearer, and Basic credentials against non-fixture services.
- Assess extended daily usability, keyboard flow, accessibility tooling, and discoverability with someone unfamiliar with Tapir.
- Exercise unsigned Windows reputation behavior, antivirus products, proxies, and unrelated Windows machines.
- Decide whether YAML import belongs in the product rather than remaining an actionable compatibility rejection.
- Verify Cubbie from an ordinary interactive/network environment or retain it as a documented anti-bot limitation.
