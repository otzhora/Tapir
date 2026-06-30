# Tapir

Tapir is a local-first, spec-bound API workspace. The first milestone focuses on:

1. Add a deployed API server by base URL.
2. Discover the live OpenAPI document.
3. Normalize and list operations.
4. Select and call a GET operation.
5. Display the response and persist local history.

Team, cloud, sync, accounts, scripting, Postman import, and collection runner features are intentionally out of scope for now.

## Development

```bash
npm install
npm run dev
```

The desktop app is an Electron host around a Vue web app core. Local state is stored in SQLite through repository interfaces so later hosted implementations can replace those adapters.

To run Tapir with both local test APIs:

```bash
npm run dev:with-test-projects
```

## Test APIs

Two small Swagger-backed API fixtures live under `test-projects/` for testing Tapir discovery and request execution:

- `test-projects/node-swagger-api`: dependency-free Node server on `http://localhost:5051`
- `test-projects/dotnet-swagger-api`: ASP.NET Core server on `http://localhost:5052`

Each fixture has its own README with run commands and useful Swagger/OpenAPI URLs.
