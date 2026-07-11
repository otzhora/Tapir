import http from "node:http";

const port = Number.parseInt(process.env.PORT ?? "5051", 10);
const fixtureApiKey = process.env.TAPIR_FIXTURE_API_KEY ?? "tapir-node-secret";

const animals = [
  {
    id: 1,
    name: "Mochi",
    species: "cat",
    status: "available",
    ageYears: 3,
    traits: ["quiet", "lap-friendly"],
    intakeDate: "2026-02-12",
    location: { shelterId: "sea-main", kennel: "C-14" },
    medical: { vaccinated: true, lastCheckup: "2026-06-20" }
  },
  {
    id: 2,
    name: "Nori",
    species: "dog",
    status: "adopted",
    ageYears: 5,
    traits: ["trained", "high-energy"],
    intakeDate: "2025-11-08",
    location: { shelterId: "sea-main", kennel: "D-02" },
    medical: { vaccinated: true, lastCheckup: "2026-05-03" }
  },
  {
    id: 3,
    name: "Pip",
    species: "rabbit",
    status: "foster",
    ageYears: 1,
    traits: ["gentle"],
    intakeDate: "2026-05-28",
    location: { shelterId: "eastside", kennel: "R-01" },
    medical: { vaccinated: false }
  }
];

const applications = [
  {
    id: "app_1001",
    animalId: 1,
    applicant: {
      name: "Avery Stone",
      email: "avery@example.test",
      phone: "+1-206-555-0141"
    },
    status: "in_review",
    submittedAt: "2026-06-30T09:42:00Z"
  }
];

const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Tapir Node Adoption API",
    version: "0.2.0",
    description: "Dependency-free Node API fixture with real-world OpenAPI schema features for testing Tapir.",
    contact: { name: "Tapir Fixture Team", email: "fixtures@example.test" },
    license: { name: "MIT" }
  },
  servers: [
    { url: `http://localhost:${port}`, description: "Local fixture" },
    {
      url: "https://{environment}.adoptions.example.test",
      description: "Templated remote fixture",
      variables: {
        environment: {
          default: "sandbox",
          enum: ["sandbox", "staging"]
        }
      }
    }
  ],
  tags: [
    { name: "System", description: "Operational endpoints" },
    { name: "Animals", description: "Animal catalog and intake data" },
    { name: "Applications", description: "Adoption application workflows" },
    { name: "Media", description: "Animal photos and documents" }
  ],
  security: [{ ApiKeyAuth: [] }],
  paths: {
    "/health": {
      get: {
        operationId: "getHealth",
        summary: "Get API health",
        tags: ["System"],
        security: [],
        responses: {
          200: {
            description: "The service is running",
            headers: {
              "x-request-id": {
                description: "Request correlation identifier",
                schema: { type: "string", format: "uuid" }
              }
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Health" },
                examples: {
                  healthy: {
                    summary: "Healthy response",
                    value: { status: "ok", service: "tapir-node-adoption-api", uptimeSeconds: 120 }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/auth/api-key": {
      get: {
        operationId: "getApiKeyIdentity",
        summary: "Verify an API key",
        description: "Requires the x-api-key header. The local fixture accepts tapir-node-secret by default.",
        tags: ["System"],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          200: {
            description: "Authenticated fixture identity",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["authenticated", "scheme"],
                  properties: {
                    authenticated: { type: "boolean" },
                    scheme: { type: "string" }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/animals": {
      parameters: [
        { $ref: "#/components/parameters/RequestId" },
        { $ref: "#/components/parameters/Locale" }
      ],
      get: {
        operationId: "listAnimals",
        summary: "List animals",
        description: "Returns a paged animal catalog with optional filtering and sorting.",
        tags: ["Animals"],
        parameters: [
          { $ref: "#/components/parameters/Page" },
          { $ref: "#/components/parameters/PageSize" },
          {
            name: "status",
            in: "query",
            required: false,
            style: "form",
            explode: true,
            schema: {
              type: "array",
              items: { $ref: "#/components/schemas/AnimalStatus" }
            }
          },
          {
            name: "species",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["cat", "dog", "rabbit", "bird"] }
          },
          {
            name: "sort",
            in: "query",
            required: false,
            schema: {
              type: "string",
              default: "name",
              enum: ["name", "-intakeDate", "ageYears"]
            }
          }
        ],
        responses: {
          200: {
            description: "Animals matching the requested filters",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PagedAnimals" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      },
      post: {
        operationId: "createAnimal",
        summary: "Create animal intake record",
        tags: ["Animals"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AnimalCreateRequest" }
            },
            "application/vnd.tapir.animal+json": {
              schema: { $ref: "#/components/schemas/AnimalCreateRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Animal created",
            headers: {
              Location: {
                description: "URL of the new animal resource",
                schema: { type: "string", format: "uri" }
              }
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Animal" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          409: {
            description: "Duplicate microchip or external identifier",
            content: {
              "application/problem+json": {
                schema: { $ref: "#/components/schemas/Problem" }
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
        parameters: [{ $ref: "#/components/parameters/AnimalId" }],
        responses: {
          200: {
            description: "The requested animal",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/Cat" },
                    { $ref: "#/components/schemas/Dog" },
                    { $ref: "#/components/schemas/Rabbit" }
                  ],
                  discriminator: {
                    propertyName: "species",
                    mapping: {
                      cat: "#/components/schemas/Cat",
                      dog: "#/components/schemas/Dog",
                      rabbit: "#/components/schemas/Rabbit"
                    }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      patch: {
        operationId: "updateAnimal",
        summary: "Update selected animal fields",
        tags: ["Animals"],
        parameters: [
          { $ref: "#/components/parameters/AnimalId" },
          {
            name: "If-Match",
            in: "header",
            required: false,
            description: "Optimistic concurrency token",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/merge-patch+json": {
              schema: { $ref: "#/components/schemas/AnimalPatchRequest" }
            }
          }
        },
        responses: {
          200: {
            description: "Animal updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Animal" }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" },
          412: {
            description: "ETag did not match",
            content: {
              "application/problem+json": {
                schema: { $ref: "#/components/schemas/Problem" }
              }
            }
          }
        }
      }
    },
    "/animals/{id}/photos": {
      post: {
        operationId: "uploadAnimalPhoto",
        summary: "Upload animal photo",
        tags: ["Media"],
        parameters: [{ $ref: "#/components/parameters/AnimalId" }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file", "caption"],
                properties: {
                  file: { type: "string", format: "binary" },
                  caption: { type: "string", maxLength: 120 },
                  primary: { type: "boolean", default: false },
                  tags: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              },
              encoding: {
                tags: { style: "form", explode: true }
              }
            }
          }
        },
        responses: {
          202: {
            description: "Upload accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UploadReceipt" }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/applications": {
      get: {
        operationId: "listApplications",
        summary: "List adoption applications",
        tags: ["Applications"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/Page" },
          {
            name: "submittedAfter",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" }
          },
          {
            name: "include",
            in: "query",
            required: false,
            style: "form",
            explode: false,
            schema: {
              type: "array",
              items: { type: "string", enum: ["animal", "notes", "events"] }
            }
          }
        ],
        responses: {
          200: {
            description: "Paged applications",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PagedApplications" }
              }
            }
          }
        }
      },
      post: {
        operationId: "submitApplication",
        summary: "Submit adoption application",
        tags: ["Applications"],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApplicationCreateRequest" }
            }
          }
        },
        responses: {
          202: {
            description: "Application accepted for review",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Application" }
              }
            },
            links: {
              GetApplicationById: {
                operationId: "getApplication",
                parameters: { id: "$response.body#/id" }
              }
            }
          },
          422: {
            description: "Validation failed",
            content: {
              "application/problem+json": {
                schema: { $ref: "#/components/schemas/ValidationProblem" }
              }
            }
          }
        },
        callbacks: {
          reviewCompleted: {
            "{$request.body#/callbackUrl}": {
              post: {
                summary: "Review completion webhook",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ApplicationEvent" }
                    }
                  }
                },
                responses: {
                  204: { description: "Webhook accepted" }
                }
              }
            }
          }
        }
      }
    },
    "/applications/{id}": {
      get: {
        operationId: "getApplication",
        summary: "Get application",
        tags: ["Applications"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^app_[0-9]+$" }
          },
          {
            name: "tapir-session",
            in: "cookie",
            required: false,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "The requested application",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Application" }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        name: "x-api-key",
        in: "header",
        description: "Static key for fixture clients."
      },
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    parameters: {
      AnimalId: {
        name: "id",
        in: "path",
        required: true,
        description: "Numeric animal identifier",
        schema: { type: "integer", format: "int32", minimum: 1 }
      },
      Locale: {
        name: "Accept-Language",
        in: "header",
        required: false,
        schema: { type: "string", default: "en-US" }
      },
      Page: {
        name: "page",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, default: 1 }
      },
      PageSize: {
        name: "pageSize",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 25 }
      },
      RequestId: {
        name: "x-request-id",
        in: "header",
        required: false,
        schema: { type: "string", format: "uuid" }
      }
    },
    responses: {
      BadRequest: {
        description: "Request was invalid",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/Problem" }
          }
        }
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/Problem" }
          }
        }
      },
      Unauthorized: {
        description: "Missing or invalid credentials"
      }
    },
    schemas: {
      Address: {
        type: "object",
        required: ["line1", "city", "region", "postalCode", "countryCode"],
        properties: {
          line1: { type: "string" },
          line2: { type: "string", nullable: true },
          city: { type: "string" },
          region: { type: "string", minLength: 2, maxLength: 64 },
          postalCode: { type: "string" },
          countryCode: { type: "string", minLength: 2, maxLength: 2 }
        }
      },
      Animal: {
        type: "object",
        required: ["id", "name", "species", "status", "ageYears", "traits", "intakeDate", "location"],
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string", minLength: 1, maxLength: 80 },
          species: { type: "string", enum: ["cat", "dog", "rabbit", "bird"] },
          status: { $ref: "#/components/schemas/AnimalStatus" },
          ageYears: { type: "integer", minimum: 0, maximum: 40 },
          traits: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" }
          },
          intakeDate: { type: "string", format: "date" },
          location: { $ref: "#/components/schemas/ShelterLocation" },
          medical: { $ref: "#/components/schemas/MedicalSummary" },
          links: {
            type: "object",
            additionalProperties: { type: "string", format: "uri" }
          }
        }
      },
      AnimalCreateRequest: {
        allOf: [
          { $ref: "#/components/schemas/AnimalProfileInput" },
          {
            type: "object",
            required: ["source"],
            properties: {
              source: {
                type: "string",
                enum: ["owner_surrender", "transfer", "stray"]
              },
              microchipId: { type: "string", nullable: true },
              fosterEligible: { type: "boolean", default: true }
            }
          }
        ]
      },
      AnimalPatchRequest: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          status: { $ref: "#/components/schemas/AnimalStatus" },
          traits: {
            type: "array",
            items: { type: "string" }
          },
          medical: { $ref: "#/components/schemas/MedicalSummary" }
        }
      },
      AnimalProfileInput: {
        type: "object",
        required: ["name", "species", "ageYears", "location"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          species: { type: "string", enum: ["cat", "dog", "rabbit", "bird"] },
          ageYears: { type: "integer", minimum: 0, maximum: 40 },
          traits: {
            type: "array",
            items: { type: "string" },
            default: []
          },
          location: { $ref: "#/components/schemas/ShelterLocation" },
          medical: { $ref: "#/components/schemas/MedicalSummary" }
        }
      },
      AnimalStatus: {
        type: "string",
        enum: ["available", "foster", "adopted", "medical_hold"]
      },
      Applicant: {
        type: "object",
        required: ["name", "email"],
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string", nullable: true },
          address: { $ref: "#/components/schemas/Address" }
        }
      },
      Application: {
        type: "object",
        required: ["id", "animalId", "applicant", "status", "submittedAt"],
        properties: {
          id: { type: "string", pattern: "^app_[0-9]+$" },
          animalId: { type: "integer", format: "int32" },
          applicant: { $ref: "#/components/schemas/Applicant" },
          status: {
            type: "string",
            enum: ["draft", "in_review", "approved", "declined"]
          },
          submittedAt: { type: "string", format: "date-time" },
          decision: {
            oneOf: [
              { $ref: "#/components/schemas/ApprovalDecision" },
              { $ref: "#/components/schemas/DeclineDecision" }
            ],
            nullable: true
          },
          metadata: {
            type: "object",
            additionalProperties: { type: "string" }
          }
        }
      },
      ApplicationCreateRequest: {
        type: "object",
        required: ["animalId", "applicant", "household"],
        properties: {
          animalId: { type: "integer", format: "int32", minimum: 1 },
          applicant: { $ref: "#/components/schemas/Applicant" },
          household: {
            type: "object",
            required: ["adults", "children", "hasOutdoorSpace"],
            properties: {
              adults: { type: "integer", minimum: 1 },
              children: { type: "integer", minimum: 0 },
              hasOutdoorSpace: { type: "boolean" },
              existingPets: {
                type: "array",
                items: {
                  type: "object",
                  required: ["species", "count"],
                  properties: {
                    species: { type: "string" },
                    count: { type: "integer", minimum: 1 }
                  }
                }
              }
            }
          },
          preferredVisitWindow: {
            type: "string",
            format: "date-time",
            nullable: true
          },
          callbackUrl: { type: "string", format: "uri" }
        }
      },
      ApplicationEvent: {
        type: "object",
        required: ["applicationId", "eventType", "occurredAt"],
        properties: {
          applicationId: { type: "string" },
          eventType: { type: "string", enum: ["approved", "declined", "needs_information"] },
          occurredAt: { type: "string", format: "date-time" },
          payload: {
            type: "object",
            additionalProperties: true
          }
        }
      },
      ApprovalDecision: {
        type: "object",
        required: ["type", "approvedAt", "pickupBy"],
        properties: {
          type: { type: "string", enum: ["approved"] },
          approvedAt: { type: "string", format: "date-time" },
          pickupBy: { type: "string", format: "date" }
        }
      },
      Cat: {
        allOf: [
          { $ref: "#/components/schemas/Animal" },
          {
            type: "object",
            properties: {
              species: { type: "string", enum: ["cat"] },
              litterTrained: { type: "boolean" }
            }
          }
        ]
      },
      DeclineDecision: {
        type: "object",
        required: ["type", "declinedAt", "reasonCode"],
        properties: {
          type: { type: "string", enum: ["declined"] },
          declinedAt: { type: "string", format: "date-time" },
          reasonCode: { type: "string", enum: ["capacity", "housing", "match"] }
        }
      },
      Dog: {
        allOf: [
          { $ref: "#/components/schemas/Animal" },
          {
            type: "object",
            properties: {
              species: { type: "string", enum: ["dog"] },
              energyLevel: { type: "string", enum: ["low", "medium", "high"] }
            }
          }
        ]
      },
      Health: {
        type: "object",
        required: ["status", "service", "uptimeSeconds"],
        properties: {
          status: { type: "string", enum: ["ok", "degraded"] },
          service: { type: "string" },
          uptimeSeconds: { type: "number", format: "double" },
          dependencies: {
            type: "object",
            additionalProperties: {
              type: "string",
              enum: ["ok", "degraded", "down"]
            }
          }
        }
      },
      MedicalSummary: {
        type: "object",
        required: ["vaccinated"],
        properties: {
          vaccinated: { type: "boolean" },
          lastCheckup: { type: "string", format: "date", nullable: true },
          notes: { type: "string", nullable: true, maxLength: 500 }
        }
      },
      PagedAnimals: {
        allOf: [
          { $ref: "#/components/schemas/PaginationEnvelope" },
          {
            type: "object",
            required: ["items"],
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/Animal" }
              }
            }
          }
        ]
      },
      PagedApplications: {
        allOf: [
          { $ref: "#/components/schemas/PaginationEnvelope" },
          {
            type: "object",
            required: ["items"],
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/Application" }
              }
            }
          }
        ]
      },
      PaginationEnvelope: {
        type: "object",
        required: ["page", "pageSize", "total"],
        properties: {
          page: { type: "integer", minimum: 1 },
          pageSize: { type: "integer", minimum: 1 },
          total: { type: "integer", minimum: 0 },
          nextCursor: { type: "string", nullable: true }
        }
      },
      Problem: {
        type: "object",
        required: ["type", "title", "status"],
        properties: {
          type: { type: "string", format: "uri" },
          title: { type: "string" },
          status: { type: "integer", format: "int32" },
          detail: { type: "string" },
          instance: { type: "string" },
          traceId: { type: "string" }
        }
      },
      Rabbit: {
        allOf: [
          { $ref: "#/components/schemas/Animal" },
          {
            type: "object",
            properties: {
              species: { type: "string", enum: ["rabbit"] },
              bondedPair: { type: "boolean" }
            }
          }
        ]
      },
      ShelterLocation: {
        type: "object",
        required: ["shelterId", "kennel"],
        properties: {
          shelterId: { type: "string" },
          kennel: { type: "string" },
          coordinates: {
            type: "object",
            nullable: true,
            required: ["latitude", "longitude"],
            properties: {
              latitude: { type: "number", format: "double", minimum: -90, maximum: 90 },
              longitude: { type: "number", format: "double", minimum: -180, maximum: 180 }
            }
          }
        }
      },
      UploadReceipt: {
        type: "object",
        required: ["uploadId", "status"],
        properties: {
          uploadId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["queued", "processing"] }
        }
      },
      ValidationProblem: {
        allOf: [
          { $ref: "#/components/schemas/Problem" },
          {
            type: "object",
            properties: {
              errors: {
                type: "object",
                additionalProperties: {
                  type: "array",
                  items: { type: "string" }
                }
              }
            }
          }
        ]
      }
    }
  }
};

function problem(status, title, detail) {
  return {
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    detail,
    traceId: "00000000-0000-4000-8000-000000000000"
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readJson(request) {
  const body = await readBody(request);
  return body ? JSON.parse(body) : {};
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-api-key, x-request-id, if-match",
    "content-type": "application/json; charset=utf-8",
    ...headers
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
    <title>Tapir Node Adoption API</title>
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

function page(items, pageNumber = 1, pageSize = 25) {
  return {
    page: pageNumber,
    pageSize,
    total: items.length,
    nextCursor: null,
    items
  };
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, x-api-key, x-request-id, if-match"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "tapir-node-adoption-api",
        uptimeSeconds: Math.round(process.uptime()),
        dependencies: { database: "ok", objectStorage: "ok" }
      }, { "x-request-id": "00000000-0000-4000-8000-000000000000" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/auth/api-key") {
      if (request.headers["x-api-key"] !== fixtureApiKey) {
        sendJson(response, 401, problem(401, "Unauthorized", "Provide the fixture API key in the x-api-key header."));
        return;
      }
      sendJson(response, 200, { authenticated: true, scheme: "apiKey" });
      return;
    }

    if (request.method === "GET" && (url.pathname === "/swagger" || url.pathname === "/swagger/")) {
      sendHtml(response, swaggerHtml());
      return;
    }

    if (request.method === "GET" && (url.pathname === "/swagger.json" || url.pathname === "/openapi.json")) {
      sendJson(response, 200, openApiDocument);
      return;
    }

    if (url.pathname === "/animals" && request.method === "GET") {
      const statuses = url.searchParams.getAll("status");
      const species = url.searchParams.get("species");
      const filteredAnimals = animals.filter((animal) => {
        const statusMatches = statuses.length === 0 || statuses.includes(animal.status);
        const speciesMatches = !species || animal.species === species;
        return statusMatches && speciesMatches;
      });
      sendJson(response, 200, page(filteredAnimals));
      return;
    }

    if (url.pathname === "/animals" && request.method === "POST") {
      const body = await readJson(request);
      const animal = {
        id: animals.length + 1,
        status: "available",
        intakeDate: new Date().toISOString().slice(0, 10),
        traits: [],
        ...body
      };
      animals.push(animal);
      sendJson(response, 201, animal, { Location: `/animals/${animal.id}` });
      return;
    }

    const animalMatch = url.pathname.match(/^\/animals\/(\d+)$/);
    if (animalMatch && request.method === "GET") {
      const animal = animals.find((item) => item.id === Number.parseInt(animalMatch[1], 10));
      sendJson(response, animal ? 200 : 404, animal ?? problem(404, "Animal not found", "No animal exists with that identifier."));
      return;
    }

    if (animalMatch && request.method === "PATCH") {
      const animal = animals.find((item) => item.id === Number.parseInt(animalMatch[1], 10));
      if (!animal) {
        sendJson(response, 404, problem(404, "Animal not found", "No animal exists with that identifier."));
        return;
      }
      Object.assign(animal, await readJson(request));
      sendJson(response, 200, animal);
      return;
    }

    const photoMatch = url.pathname.match(/^\/animals\/(\d+)\/photos$/);
    if (photoMatch && request.method === "POST") {
      sendJson(response, 202, {
        uploadId: "11111111-1111-4111-8111-111111111111",
        status: "queued"
      });
      return;
    }

    if (url.pathname === "/applications" && request.method === "GET") {
      sendJson(response, 200, page(applications));
      return;
    }

    if (url.pathname === "/applications" && request.method === "POST") {
      const body = await readJson(request);
      const application = {
        id: `app_${1001 + applications.length}`,
        status: "in_review",
        submittedAt: new Date().toISOString(),
        ...body
      };
      applications.push(application);
      sendJson(response, 202, application);
      return;
    }

    const applicationMatch = url.pathname.match(/^\/applications\/(app_\d+)$/);
    if (applicationMatch && request.method === "GET") {
      const application = applications.find((item) => item.id === applicationMatch[1]);
      sendJson(response, application ? 200 : 404, application ?? problem(404, "Application not found", "No application exists with that identifier."));
      return;
    }

    sendJson(response, 404, problem(404, "Not found", "The requested route is not implemented by this fixture."));
  } catch (error) {
    sendJson(response, 400, problem(400, "Bad request", error instanceof Error ? error.message : "Unable to process request."));
  }
});

server.listen(port, () => {
  console.log(`Tapir Node Adoption API running at http://localhost:${port}`);
  console.log(`Swagger UI available at http://localhost:${port}/swagger`);
});
