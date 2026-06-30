# Tapir Node Swagger API

Dependency-free Node fixture for testing Tapir against a small OpenAPI-backed service.

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
