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
