# Tapir .NET Logistics API

ASP.NET Core fixture for testing Tapir against a realistic Swashbuckle-generated OpenAPI document.

The fixture includes live endpoints for every authentication shape Tapir supports:

| Endpoint | OpenAPI security | Default credential |
| --- | --- | --- |
| `GET /auth/api-key` | Header API key | `x-api-key: tapir-dotnet-secret` |
| `GET /auth/bearer` | HTTP bearer | `Bearer tapir-dotnet-token` |
| `GET /auth/basic` | HTTP basic | `tapir` / `tapir-dotnet-password` |
| `GET /auth/query-api-key` | Query API key | `api_key=tapir-dotnet-query-secret` |
| `GET /auth/cookie-api-key` | Cookie API key | `tapir_session=tapir-dotnet-session` |
| `GET /auth/alternative` | Header API key OR bearer | Either corresponding credential |
| `GET /auth/combined` | Header API key AND basic | Both corresponding credentials |
| `GET /auth/optional` | Anonymous OR bearer | No credential required |

Override the defaults with `TAPIR_FIXTURE_API_KEY`, `TAPIR_FIXTURE_BEARER_TOKEN`,
`TAPIR_FIXTURE_USERNAME`, `TAPIR_FIXTURE_PASSWORD`, `TAPIR_FIXTURE_QUERY_API_KEY`, and
`TAPIR_FIXTURE_COOKIE_API_KEY`.

The API uses typed minimal endpoints so the emitted schema includes framework-generated shapes for
nested records, enums, arrays, dictionaries, nullable values, validation attributes, typed request
bodies, route/query/header/form parameters, multipart uploads, multiple response types, and security
schemes.

## Run

```bash
dotnet run
```

The service listens on `http://localhost:5052` by default.

Useful URLs:

- `http://localhost:5052/swagger`
- `http://localhost:5052/swagger/v1/swagger.json`
- `http://localhost:5052/health`
- `http://localhost:5052/weather`
- `http://localhost:5052/weather/1`
- `http://localhost:5052/shipments`
- `http://localhost:5052/shipments/shp_1001`
