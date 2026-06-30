import http from "node:http";

const port = Number.parseInt(process.env.PORT ?? "5051", 10);

const animals = [
  { id: 1, name: "Mochi", species: "cat", status: "available" },
  { id: 2, name: "Nori", species: "dog", status: "adopted" },
  { id: 3, name: "Pip", species: "rabbit", status: "available" }
];

const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Tapir Node Test API",
    version: "0.1.0",
    description: "Small dependency-free Node API fixture for testing Tapir."
  },
  servers: [{ url: `http://localhost:${port}` }],
  paths: {
    "/health": {
      get: {
        operationId: "getHealth",
        summary: "Get API health",
        tags: ["System"],
        responses: {
          200: {
            description: "The service is running",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Health" }
              }
            }
          }
        }
      }
    },
    "/animals": {
      get: {
        operationId: "listAnimals",
        summary: "List animals",
        tags: ["Animals"],
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["available", "adopted"] }
          }
        ],
        responses: {
          200: {
            description: "Animals matching the optional status filter",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Animal" }
                }
              }
            }
          }
        }
      }
    },
    "/animals/{id}": {
      get: {
        operationId: "getAnimal",
        summary: "Get an animal by ID",
        tags: ["Animals"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", format: "int32" }
          }
        ],
        responses: {
          200: {
            description: "The requested animal",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Animal" }
              }
            }
          },
          404: { description: "Animal not found" }
        }
      }
    }
  },
  components: {
    schemas: {
      Animal: {
        type: "object",
        required: ["id", "name", "species", "status"],
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          species: { type: "string" },
          status: { type: "string", enum: ["available", "adopted"] }
        }
      },
      Health: {
        type: "object",
        required: ["status", "service"],
        properties: {
          status: { type: "string" },
          service: { type: "string" }
        }
      }
    }
  }
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-api-key",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, html) {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function swaggerHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tapir Node Test API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/swagger.json", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-api-key"
    });
    response.end();
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "tapir-node-swagger-api" });
    return;
  }

  if (url.pathname === "/swagger" || url.pathname === "/swagger/") {
    sendHtml(response, swaggerHtml());
    return;
  }

  if (url.pathname === "/swagger.json" || url.pathname === "/openapi.json") {
    sendJson(response, 200, openApiDocument);
    return;
  }

  if (url.pathname === "/animals") {
    const status = url.searchParams.get("status");
    const filteredAnimals = status ? animals.filter((animal) => animal.status === status) : animals;
    sendJson(response, 200, filteredAnimals);
    return;
  }

  const animalMatch = url.pathname.match(/^\/animals\/(\d+)$/);
  if (animalMatch) {
    const animal = animals.find((item) => item.id === Number.parseInt(animalMatch[1], 10));
    sendJson(response, animal ? 200 : 404, animal ?? { error: "Animal not found" });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`Tapir Node Test API running at http://localhost:${port}`);
  console.log(`Swagger UI available at http://localhost:${port}/swagger`);
});
