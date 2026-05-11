import swaggerUi from "swagger-ui-express";

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Vending 3D Control API",
    version: "1.0.0",
    description:
      "API for vending serial control, dispenser command, and service health. " +
      "Serial write endpoints support vending and navigation lights, and include SY600 command APIs with decoded responses. " +
      "Vending write accepts hex payload; navigation-lights write accepts object payload.",
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
        summary: "Write navigation-lights payload and wait for RX",
        description:
          "Body `data` is a JSON object (for example LED command object). " +
          "Server serializes it to JSON line, transmits bytes, and waits for RX with retry-on-timeout behavior.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/NavigationLightsWriteRequest",
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
    "/serial/navigation-lights/write-no-wait": {
      post: {
        tags: ["Serial"],
        summary: "Write navigation-lights payload without waiting RX",
        description:
          "Fire-and-forget mode: write command to serial and return after drain. " +
          "Use when device responses are unstable or not required for this operation.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/NavigationLightsWriteRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Write accepted (no RX wait)",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/NavigationLightsNoWaitResponse",
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
        },
      },
    },
    "/sy600/c3/lift": {
      post: {
        tags: ["SY600"],
        summary: "C3 control lift/floor position",
        description:
          "Control elevator position. target=0 reset, 1..7 floor, 0x55..0x57 output positions.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600C3Request" },
              example: { target: 1 },
            },
          },
        },
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/c4/micro-step": {
      post: {
        tags: ["SY600"],
        summary: "C4 micro-step dispense command",
        description:
          "Trigger micro-step dispensing for channel range. Optional repeat lets API send same command multiple rounds sequentially.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600C4Request" },
              example: { layer: 1, channelStart: 0, channelEnd: 5, repeat: 3 },
            },
          },
        },
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/c5/output-door": {
      post: {
        tags: ["SY600"],
        summary: "C5 control output door",
        description: "Control output door: action 0 close, 1 open.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600DoorRequest" },
              example: { action: 1, doorNo: 1 },
            },
          },
        },
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/c6/conveyor": {
      post: {
        tags: ["SY600"],
        summary: "C6 control conveyor direction/time",
        description: "Control conveyor direction and run duration in seconds.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600C6Request" },
              example: { direction: 0, seconds: 3 },
            },
          },
        },
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/c7/pickup-door": {
      post: {
        tags: ["SY600"],
        summary: "C7 control pickup door",
        description: "Control pickup door: action 0 close, 1 open.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600DoorRequest" },
              example: { action: 1, doorNo: 1 },
            },
          },
        },
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/24/reset-scan": {
      post: {
        tags: ["SY600"],
        summary: "0x24 reset door/lift and scan info",
        description: "Reset door and/or lift then read machine topology info.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600ResetScanRequest" },
              example: { resetDoor: 1, resetLift: 1 },
            },
          },
        },
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/35/infrared": {
      post: {
        tags: ["SY600"],
        summary: "0x35 read infrared/hall status",
        description:
          "Read one sensor status by type. 0=drop, 1=platform1, 2=anti-pinch1, 3=reserved, 4=platform2, 5=anti-pinch2, 6=platform3, 7=anti-pinch3.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600InfraredRequest" },
              example: { sensorType: 0 },
            },
          },
        },
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/39/microswitch": {
      get: {
        tags: ["SY600"],
        summary: "0x39 read microswitch status",
        description:
          "Read full microswitch/sensor status set. Response `dataBytes[0]` is sensor count, " +
          "and the remaining bytes are status values in fixed order (0=Normal, 1=Blocked): " +
          "pickupDoor1Up, pickupDoor1Down, antiPinch1, outputDoor1Up, outputDoor1Down, " +
          "pickupDoor2Up, pickupDoor2Down, antiPinch2, outputDoor2Up, outputDoor2Down, " +
          "pickupDoor3Up, pickupDoor3Down, antiPinch3, outputDoor3Up, outputDoor3Down.",
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        tags: ["SY600"],
        summary: "0x39 read microswitch status (deprecated, use GET)",
        description:
          "Deprecated compatibility endpoint. Use GET /sy600/39/microswitch. " +
          "Read full microswitch/sensor status set. Response `dataBytes[0]` is sensor count, " +
          "and the remaining bytes are status values in fixed order (0=Normal, 1=Blocked): " +
          "pickupDoor1Up, pickupDoor1Down, antiPinch1, outputDoor1Up, outputDoor1Down, " +
          "pickupDoor2Up, pickupDoor2Down, antiPinch2, outputDoor2Up, outputDoor2Down, " +
          "pickupDoor3Up, pickupDoor3Down, antiPinch3, outputDoor3Up, outputDoor3Down.",
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/28/dispense": {
      post: {
        tags: ["SY600"],
        summary: "0x28 channel dispense command",
        description: "Dispense by channel range with 8-byte order id.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600DispenseRequest" },
              example: {
                layerAddressHex: "AABBCCDD",
                channelStart: 0,
                channelEnd: 0,
                orderIdHex: "0011223344556677",
              },
            },
          },
        },
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/e0/ack": {
      post: {
        tags: ["SY600"],
        summary: "0xE0 acknowledge active error report",
        description: "Acknowledge E0 active error report so machine stops repeating report.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Sy600E0AckRequest" },
              example: { addressHex: "AABBCCDD" },
            },
          },
        },
        responses: {
          200: { description: "ACK result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
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
            example: "ee01aabbccddc30002000052c6",
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
            example: "FF0100000000C3000200006544",
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
      NavigationLightsWriteRequest: {
        type: "object",
        properties: {
          data: {
            type: "object",
            additionalProperties: true,
            example: { act: "led", cmd: [1, 165, 0, 128, 0, 1] },
            description: "Navigation-lights JSON payload that will be serialized and sent over serial",
          },
        },
        required: ["data"],
      },
      NavigationLightsNoWaitResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          bytes: { type: "number", example: 33 },
          accepted: { type: "object", additionalProperties: true },
          mode: { type: "string", example: "no-wait" },
        },
        required: ["success", "bytes", "accepted", "mode"],
      },
      Sy600Response: {
        type: "object",
        properties: {
          txHex: { type: "string", example: "EE01AABBCCDDC3000201000000" },
          response: {
            type: "object",
            properties: {
              command: { type: "string", example: "0xC3" },
              address: { type: "string", example: "AABBCCDD" },
              dataLength: { type: "number", example: 2 },
              dataBytes: { type: "array", items: { type: "integer" } },
              rawHex: { type: "string" },
              decoded: { type: "object", additionalProperties: true },
            },
            required: ["command", "address", "dataLength", "dataBytes", "rawHex", "decoded"],
            description:
              "Decoded payload by command. For 0x39 microswitch, use `decoded.microswitchCount` and `decoded.statusBytes` " +
              "where 0=Normal and 1=Blocked, ordered by machine sensor map.",
          },
        },
        required: ["txHex", "response"],
      },
      Sy600C3Request: {
        type: "object",
        properties: {
          target: { type: "number", example: 1, description: "0 reset, 1..7 floor, 0x55..0x57 output position" },
        },
        required: ["target"],
      },
      Sy600C4Request: {
        type: "object",
        properties: {
          layer: { type: "number", example: 1 },
          channelStart: { type: "number", example: 0 },
          channelEnd: { type: "number", example: 5 },
          repeat: { type: "number", example: 3, description: "Optional repeat count, range 1..100" },
        },
        required: ["layer", "channelStart", "channelEnd"],
      },
      Sy600DoorRequest: {
        type: "object",
        properties: {
          action: { type: "number", example: 1, description: "0 close, 1 open" },
          doorNo: { type: "number", example: 1 },
        },
        required: ["action", "doorNo"],
      },
      Sy600C6Request: {
        type: "object",
        properties: {
          direction: { type: "number", example: 0, description: "0 forward, 1 reverse" },
          seconds: { type: "number", example: 3, description: "0 for device default time" },
        },
        required: ["direction", "seconds"],
      },
      Sy600ResetScanRequest: {
        type: "object",
        properties: {
          resetDoor: { type: "number", example: 1 },
          resetLift: { type: "number", example: 1 },
        },
        required: ["resetDoor", "resetLift"],
      },
      Sy600InfraredRequest: {
        type: "object",
        properties: {
          sensorType: {
            type: "number",
            example: 0,
            description:
              "0=drop sensor, 1=platform1, 2=anti-pinch1, 3=reserved, 4=platform2, 5=anti-pinch2, 6=platform3, 7=anti-pinch3",
          },
        },
        required: ["sensorType"],
      },
      Sy600DispenseRequest: {
        type: "object",
        properties: {
          layerAddressHex: { type: "string", example: "AABBCCDD" },
          channelStart: { type: "number", example: 0 },
          channelEnd: { type: "number", example: 0 },
          orderIdHex: { type: "string", example: "0011223344556677" },
        },
        required: ["channelStart", "channelEnd", "orderIdHex"],
      },
      Sy600E0AckRequest: {
        type: "object",
        properties: {
          addressHex: { type: "string", example: "AABBCCDD" },
        },
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
