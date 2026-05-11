import swaggerUi from "swagger-ui-express";

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Vending 3D Control API",
    version: "1.0.0",
    description:
      "API for vending serial control, dispenser command, and service health. " +
      "Serial write endpoints accept an even-length hex string in `data`, send it as raw bytes, " +
      "then wait for device RX until idle or `SERIAL_WRITE_TIMEOUT_MS`. " +
      "`POST /serial/vending/write` also uses HTTP `SERIAL_API_TIMEOUT_MS` on the socket (see README).",
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
        summary: "Write hex payload to vending serial and wait for RX",
        description:
          "Body `data` must be an even-length hexadecimal string (optional spaces are ignored). " +
          "The server writes raw bytes to the vending port, waits for response data, then returns `responseHex` / `responseBytes`. " +
          "If no RX arrives within `SERIAL_WRITE_TIMEOUT_MS`, the handler responds with **504**. " +
          "This route sets a longer HTTP socket timeout (`SERIAL_API_TIMEOUT_MS`); if the socket times out first, **504** is returned with `error: Request timeout`.",
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
            description:
              "Timeout: no serial RX within `SERIAL_WRITE_TIMEOUT_MS`, or HTTP socket timeout (`SERIAL_API_TIMEOUT_MS`) on this route. " +
              "Body shape is usually `{ error, details }` (see ErrorResponse).",
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
        summary: "Write hex payload to navigation-lights serial and wait for RX",
        description:
          "Same contract as vending write: even-length hex in `data`, raw TX, wait for RX until idle or `SERIAL_WRITE_TIMEOUT_MS`. " +
          "This route does not apply the separate `SERIAL_API_TIMEOUT_MS` middleware used on vending write.",
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
            description: "No serial RX within `SERIAL_WRITE_TIMEOUT_MS` (or upstream closed the connection).",
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
          mqtt: {
            type: "object",
            description: "MQTT client status (when QR/NFC publishing is configured)",
            additionalProperties: true,
          },
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
                  qrNfc: { $ref: "#/components/schemas/SerialPortHealth" },
                },
              },
              writeTimeoutMs: {
                type: "number",
                example: 50000,
                description: "Value of SERIAL_WRITE_TIMEOUT_MS used when waiting for serial RX after a write",
              },
            },
          },
        },
        required: ["status", "timestamp", "serialReady", "mqtt", "serial"],
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
          data: {
            type: "string",
            example: "EE010000",
            description: "Even-length hex string to send as raw bytes; spaces are allowed and stripped",
          },
        },
        required: ["data"],
      },
      SerialWriteResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          bytes: { type: "number", example: 4 },
          responseHex: {
            type: "string",
            example: "EE0100AA",
            description: "Concatenated RX bytes as uppercase hex",
          },
          responseBytes: {
            type: "array",
            items: { type: "integer" },
            example: [238, 1, 0, 170],
            description: "RX bytes as decimal integers",
          },
        },
        required: ["success", "bytes", "responseHex", "responseBytes"],
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
