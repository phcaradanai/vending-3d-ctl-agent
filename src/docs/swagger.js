import swaggerUi from "swagger-ui-express";

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Vending 3D Control API",
    version: "1.0.0",
    description: "API for vending serial control, dispenser command, and service health.",
  },
  servers: [
    {
      url: "http://localhost:3303/api/v1",
      description: "Local server (API v1)",
    },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          200: {
            description: "Service status and serial health",
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
    "/vending/drugDispenser": {
      post: {
        tags: ["Dispenser"],
        summary: "Create drug dispenser command payload",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DrugDispenserRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Dispenser payload accepted",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DrugDispenserResponse",
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
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "degraded" },
          timestamp: { type: "string", format: "date-time" },
          serialReady: { type: "boolean", example: false },
          process: {
            type: "object",
            properties: {
              uptimeSeconds: { type: "number", example: 120 },
              nodeVersion: { type: "string", example: "v24.13.1" },
              pid: { type: "number", example: 12345 },
            },
          },
          serial: {
            type: "object",
            properties: {
              summary: {
                type: "object",
                properties: {
                  serialReady: { type: "boolean", example: false },
                  connectedPorts: { type: "number", example: 1 },
                  totalPorts: { type: "number", example: 2 },
                },
              },
              ports: {
                type: "object",
                properties: {
                  vending: { $ref: "#/components/schemas/SerialPortHealth" },
                  navigationLights: { $ref: "#/components/schemas/SerialPortHealth" },
                },
              },
              writeTimeoutMs: { type: "number", example: 3000 },
            },
          },
        },
        required: ["status", "timestamp", "serialReady", "serial"],
      },
      SerialPortHealth: {
        type: "object",
        properties: {
          path: { type: "string", example: "COM10" },
          baudRate: { type: "number", example: 115200 },
          channel: { type: "string", example: "vending" },
          configuredPath: { type: "string", example: "COM10" },
          configuredBaudRate: { type: "number", example: 115200 },
          serialReady: { type: "boolean", example: false },
          isConnected: { type: "boolean", example: false },
          isReconnectScheduled: { type: "boolean", example: true },
          lastError: { type: "string", nullable: true, example: "Opening COM10: Access denied" },
          lastConnectedAt: { type: "string", nullable: true, example: "2026-05-07T08:02:38.672Z" },
          lastWriteAt: { type: "string", nullable: true, example: "2026-05-07T08:05:01.120Z" },
        },
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
      DrugDispenserRequest: {
        type: "object",
        properties: {
          prescription: { type: "string", example: "1234567909" },
          ctrl: { type: "number", example: 3 },
          items: { type: "array", items: { type: "object" } },
          type: { type: "string", example: "standby" },
          url: { type: "string", example: "http://host/api/vending/drugDispense/hook/status" },
        },
        required: ["prescription"],
      },
      DrugDispenserResponse: {
        type: "object",
        properties: {
          ok: { type: "number", example: 1 },
          data: {
            type: "object",
            properties: {
              ts: { type: "string", example: "2026-05-07 15:53:39" },
              timeProcess: {
                type: "object",
                properties: {
                  tStart: { type: "string", example: "2026-05-07 15:53:39" },
                  tStop: { type: "string", example: "2026-05-07 15:53:39" },
                },
              },
              prescriptionNo: { type: "string", example: "1234567909" },
              type: { type: "string", example: "standby" },
              status: { type: "string", example: "pending" },
              door: { type: "number", example: 1 },
              vendingCode: { type: "string", example: "FFFFFFFF" },
              raw: { type: "object" },
            },
          },
        },
        required: ["ok", "data"],
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
