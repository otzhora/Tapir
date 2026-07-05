# Tapir Node Adoption API

Dependency-free Node fixture for testing Tapir against a realistic hand-authored OpenAPI document.

The schema intentionally covers common Swagger/OpenAPI features such as reusable parameters and
responses, API key and bearer auth, server variables, pagination envelopes, polymorphic responses,
`oneOf`, `allOf`, discriminators, nullable fields, multipart uploads, callbacks, links, cookies,
headers, examples, and multiple request body media types.

## Run

```bash
npm start
```

The service listens on `http://localhost:5051` by default. Set `PORT` to override it.

Useful URLs:

- `http://localhost:5051/swagger`
- `http://localhost:5051/swagger.json`
- `http://localhost:5051/health`
- `http://localhost:5051/animals`
- `http://localhost:5051/animals/1`
- `http://localhost:5051/applications`
- `http://localhost:5051/applications/app_1001`
