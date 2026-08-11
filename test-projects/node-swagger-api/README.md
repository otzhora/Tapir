# Tapir Node Adoption API

Dependency-free Node fixture for testing Tapir against a realistic hand-authored OpenAPI document.

The fixture includes live endpoints for every authentication shape Tapir supports:

| Endpoint | OpenAPI security | Default credential |
| --- | --- | --- |
| `GET /auth/api-key` | Header API key | `x-api-key: tapir-node-secret` |
| `GET /auth/bearer` | HTTP bearer | `Bearer tapir-node-token` |
| `GET /auth/basic` | HTTP basic | `tapir` / `tapir-node-password` |
| `GET /auth/query-api-key` | Query API key | `api_key=tapir-node-query-secret` |
| `GET /auth/cookie-api-key` | Cookie API key | `tapir_session=tapir-node-session` |
| `GET /auth/alternative` | Header API key OR bearer | Either corresponding credential |
| `GET /auth/combined` | Header API key AND basic | Both corresponding credentials |
| `GET /auth/optional` | Anonymous OR bearer | No credential required |

Override the defaults with `TAPIR_FIXTURE_API_KEY`, `TAPIR_FIXTURE_BEARER_TOKEN`,
`TAPIR_FIXTURE_USERNAME`, `TAPIR_FIXTURE_PASSWORD`, `TAPIR_FIXTURE_QUERY_API_KEY`, and
`TAPIR_FIXTURE_COOKIE_API_KEY`.

The schema intentionally covers common Swagger/OpenAPI features such as reusable parameters and
responses, API key/basic/bearer auth, server variables, pagination envelopes, polymorphic responses,
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
