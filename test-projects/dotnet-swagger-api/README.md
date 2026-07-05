# Tapir .NET Logistics API

ASP.NET Core fixture for testing Tapir against a realistic Swashbuckle-generated OpenAPI document.

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
