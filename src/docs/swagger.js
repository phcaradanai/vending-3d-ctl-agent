import swaggerUi from "swagger-ui-express";

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Vending 3D Control API",
    version: "1.0.0",
    description: "API for health check and writing data to serial port.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local server",
    },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          200: {
            description: "Service status and serial config",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse",
                },
              },
            },
          },
        },
      },
    },
    "/serial/vending/write": {
      post: {
        tags: ["Serial"],
        summary: "Write string data to vending serial port",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SerialWriteRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Write success",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SerialWriteResponse",
                },
              },
            },
          },
          400: {
            description: "Invalid request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          500: {
            description: "Serial write failure",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          504: {
            description: "Serial write timeout",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/serial/navigation-lights/write": {
      post: {
        tags: ["Serial"],
        summary: "Write string data to navigation lights serial port",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SerialWriteRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Write success",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SerialWriteResponse",
                },
              },
            },
          },
          400: {
            description: "Invalid request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          500: {
            description: "Serial write failure",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          504: {
            description: "Serial write timeout",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          vending: {
            $ref: "#/components/schemas/SerialConfig",
          },
          navigationLights: {
            $ref: "#/components/schemas/SerialConfig",
          },
        },
        required: ["status", "vending", "navigationLights"],
      },
      SerialConfig: {
        type: "object",
        properties: {
          path: { type: "string", example: "/dev/ttyUSB0" },
          baudRate: { type: "number", example: 9600 },
        },
        required: ["path", "baudRate"],
      },
      SerialWriteRequest: {
        type: "object",
        properties: {
          data: { type: "string", example: "HELLO\\n" },
        },
        required: ["data"],
      },
      SerialWriteResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          bytes: { type: "number", example: 6 },
        },
        required: ["success", "bytes"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "string" },
        },
        required: ["error"],
      },
    },
  },
};

export function setupSwagger(app) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
