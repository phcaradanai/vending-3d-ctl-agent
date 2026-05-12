import swaggerUi from "swagger-ui-express";
import { API_BEARER_TOKEN } from "../config/env.js";

/** Multi-line OpenAPI `description` (Swagger UI แสดงขึ้นบรรทัดใหม่อ่านง่าย). */
function d(...lines) {
  return lines.join("\n");
}

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Vending 3D Control API",
    version: "1.0.0",
    description: d(
      "Vending 3D control API — serial, navigation lights, SY600 commands, dispenser, health, log listing/tail.",
      "",
      "**Serial**",
      "- `POST /serial/vending/write` — hex string → vending port, wait RX.",
      "- `POST /serial/navigation-lights/write` — JSON object → line + newline → nav port, wait RX (retry on timeout).",
      "- `POST /serial/navigation-lights/write-no-wait` — same TX, no RX wait.",
      "",
      "**SY600**",
      "- High-level routes under `/sy600/*` build binary frames, send on vending serial, return decoded fields.",
      "- Lift **target** `0` reset, `1..7` floors, **`85`/`86`/`87`** (0x55–0x57) = delivery / output positions (confirm door mapping with vendor).",
      "",
      "**Logs (optional)**",
      "- `GET /logs` and `GET /logs/{category}` when `APP_LOG_VIEW_API_ENABLED=true` (see README).",
      "",
      "**Authentication**",
      "- **`API_BEARER_TOKEN`** — when set, protected routes under **`/api/v1/*`** require **`Authorization: Bearer <token>`** (timing-safe compare).",
      "- **`GET /health`** is **public** (no Bearer) so load balancers / Docker healthchecks still work.",
      "- **`API_BEARER_REQUIRED=true`** — refuse to start unless **`API_BEARER_TOKEN`** is set (recommended for production).",
      "- Use **Authorize** in Swagger UI (persisted) when a token is configured.",
      "",
      "**Docker / operations**",
      "- Mount a host directory to **`/app/logs`** so `access.log` and `events-*.log` survive container restarts.",
      "- **Build in Compose:** `docker compose up -d --build` using `docker-compose.yml`.",
      "- **Registry image:** `docker compose -f docker-compose.image.yml up -d` (set `VENDING_CTL_IMAGE` if needed).",
      "",
      "**Docs**",
      "- This spec is served at `/docs` (same origin as the API; default base URL below is `localhost:3303`)."
    ),
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
        security: [],
        tags: ["System"],
        summary: "Health check",
        description: d(
          "สถานะรวมแบบจัดกลุ่มสำหรับ monitoring / dashboard.",
          "",
          "**กล่องหลัก**",
          "- `summary` — สรุปเร็ว: systemStatus, จำนวน alerts, serial/MQTT/SY600 แบบย่อ",
          "- `devices` — รายละเอียด serial แต่ละช่อง, **คิวเขียน serial** (`devices.serial.writeQueues`), MQTT, SY600",
          "- `diagnostics` — process (รวม memory), serial policy (timeout, nav retry), เวลา/timezone",
          "- `alerts` — รายการเตือน (serial หลุด, MQTT เปิดแต่ไม่ต่อ ฯลฯ)",
          "",
          "**status ระดับบนสุด**",
          "- `ok` — serial พร้อมครบ และถ้าเปิด MQTT ต้องต่อ broker ได้",
          "- `degraded` — เงื่อนไขด้านบนไม่ครบ"
        ),
        responses: {
          200: {
            description: "Service status, devices, diagnostics, and alerts",
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
    "/job/que": {
      get: {
        tags: ["System"],
        summary: "Serial write queue snapshot",
        description: d(
          "ข้อมูลคิวเขียน serial แบบเดียวกับ `devices.serial.writeQueues` ใน `GET /health`.",
          "",
          "เมื่อตั้ง `API_BEARER_TOKEN` ต้องส่ง `Authorization: Bearer` เหมือน endpoint สั่งงานอื่น",
          "",
          "- `writeQueues` — ต่อช่อง vending / navigation / qr (qr ไม่มีคิวเขียน)",
          "- `activeQueueKeys` — key ภายในสำหรับ debug",
          "- `portQueueConsoleLog` — ค่า env `SERIAL_PORT_QUEUE_LOG`"
        ),
        responses: {
          200: {
            description: "Queue snapshot",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JobQueueResponse",
                },
              },
            },
          },
        },
      },
    },
    "/logs": {
      get: {
        tags: ["Logs"],
        summary: "List log categories and files",
        description: d(
          "ต้องเปิด `APP_LOG_VIEW_API_ENABLED=true` มิฉะนั้นได้ **404**",
          "",
          "เมื่อตั้ง `API_BEARER_TOKEN` ต้องส่ง `Authorization: Bearer` ตามเดียวกับ endpoint อื่นภายใต้ `/api/v1`",
          "",
          "คืนรายการหมวด (`http`, `serial`, …, `access`) และไฟล์ในโฟลเดอร์ `logs/` พร้อมขนาด / mtime"
        ),
        responses: {
          200: {
            description: "Categories and log file metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogsListResponse" },
              },
            },
          },
          401: {
            description: "Missing or invalid Bearer when `API_BEARER_TOKEN` is set",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          404: {
            description: "Log view API disabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/logs/{category}": {
      get: {
        tags: ["Logs"],
        summary: "Tail lines from a log file",
        description: d(
          "อ่านท้ายไฟล์เป็นบรรทัด (สำหรับไฟล์ `.log` ใหญ่จะอ่านเฉพาะช่วงท้ายตาม `APP_LOG_VIEW_TAIL_BYTES`)",
          "",
          "ไฟล์ `.gz` จะถูก decompress ทั้งก้อนในหน่วยความจำ — จำกัดขนาดด้วย `APP_LOG_VIEW_GZIP_MAX_BYTES`",
          "",
          "Query:",
          "- `lines` — จำนวนบรรทัดสูงสุด (ค่าเริ่มต้น ~200, สูงสุดตาม `APP_LOG_VIEW_MAX_LINES`)",
          "- `file` — เลือกไฟล์เฉพาะ (basename เช่น `events-serial-20260511-p0.log`); ถ้าไม่ส่งใช้ไฟล์ active (`events-<category>.log` หรือ `access.log`)"
        ),
        parameters: [
          {
            name: "category",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: ["http", "serial", "queue", "sy600", "mqtt", "app", "error", "access"],
            },
          },
          {
            name: "lines",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 5000, default: 200 },
          },
          {
            name: "file",
            in: "query",
            required: false,
            schema: { type: "string", example: "events-http.log" },
          },
        ],
        responses: {
          200: {
            description: "Tail lines as JSON strings (JSONL lines)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogTailResponse" },
              },
            },
          },
          400: {
            description: "Invalid file name",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          404: {
            description: "API disabled, unknown category, or file missing",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          413: {
            description: "Gzip log exceeds configured max size",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
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
        description: d(
          "ส่งคำสั่งแบบ **hex** ไปพอร์ต vending แล้วรอตอบกลับทาง serial.",
          "",
          "**Body**",
          "- `data` — string hex ความยาวคู่ (ช่องว่างใน string จะถูกลบก่อนส่ง)",
          "",
          "**พฤติกรรม**",
          "- แปลง hex → bytes → write → รอ RX (จบเฟรมเมื่อ idle ~80ms หรือหมดเวลา `SERIAL_WRITE_TIMEOUT_MS`)",
          "- ตอบ **504** ถ้าไม่ได้ RX ภายใน timeout",
          "- Route นี้ตั้ง HTTP socket timeout เป็น `SERIAL_API_TIMEOUT_MS` (ควร ≥ write timeout)",
          "",
          "**คำแนะนำ**",
          "- ถ้าเป็นเฟรม SY600 มาตรฐาน แนะนำใช้ `/sy600/*` แทนการประกอบ hex มือ"
        ),
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
        description: d(
          "ส่งคำสั่ง **navigation lights** เป็น JSON object แล้วรอ RX.",
          "",
          "**Body**",
          "- `data` — object (เช่นคำสั่ง LED)",
          "",
          "**รูปแบบ LED (`act`: `\"led\"`) — ฟิลด์ `cmd` มี 6 ตัวเลข**",
          "  1. หลอดเริ่มต้น (index แรกในช่วง)",
          "  2. หลอดสุดท้าย (index ปลายช่วง)",
          "  3. R (0–255)",
          "  4. G (0–255)",
          "  5. B (0–255)",
          "  6. mode — `0` = เปิดค้าง (steady), `1` = กระพริบ (flash)",
          "",
          "**การส่งจริง**",
          "- `JSON.stringify(data)` ต่อท้ายด้วย newline แล้วส่งเป็น bytes",
          "- มี retry เมื่อ timeout ตาม env `SERIAL_NAVIGATION_LIGHTS_*`",
          "",
          "**Response 200**",
          "- `{ success, accepted, serialResponse }` — ดู schema NavigationLightsWaitResponse"
        ),
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
            description: d(
              "สำเร็จ — ห่อผลลัพธ์เป็น 2 ชั้น:",
              "",
              "- `accepted` — echo ของ `data` ที่ส่งมา",
              "- `serialResponse` — ผลชั้น serial เดียวกับ vending (`responseHex`, `responseBytes`, …)"
            ),
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/NavigationLightsWaitResponse",
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
        description: d(
          "**Fire-and-forget** — serialize `data` → บรรทัด JSON + newline → write → drain → ตอบทันที",
          "",
          "ความหมาย `cmd` แบบ LED เหมือน `POST /serial/navigation-lights/write` (ดู endpoint นั้น)",
          "",
          "ไม่รอ RX — ใช้เมื่อไม่ต้องการหรือไม่เสถียรเรื่องตอบกลับจากอุปกรณ์"
        ),
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
        summary: "C3 — ควบคุมลิฟท์ / ชั้น / จุดจ่าย",
        description: d(
          "**SY600 command `0xC3`** — สั่งตำแหน่งลิฟท์ (elevator).",
          "",
          "**Body**",
          "```json",
          "{ \"target\": <number> }",
          "```",
          "",
          "**ค่า `target` (1 byte)**",
          "",
          "| JSON (decimal) | hex     | ใช้ทำอะไร |",
          "|----------------|---------|-----------|",
          "| `0`            | `0x00`  | รีเซ็ต / จุดอ้างอิง (ตาม protocol) |",
          "| `1` … `7`     | `0x01`… | ชั้นคลัง (บน/ล่างตามคู่มือเครื่อง) |",
          "| **`85`**       | `0x55`  | จุดส่งของ / output ตำแหน่งที่ 1 (มักคู่ประตูจ่าย 1) |",
          "| **`86`**       | `0x56`  | จุดส่งของ / output ตำแหน่งที่ 2 |",
          "| **`87`**       | `0x57`  | จุดส่งของ / output ตำแหน่งที่ 3 |",
          "",
          "**หมายเหตุ**",
          "- mapping ประตูกับ 85/86/87 ควรยืนยันกับเอกสาร vendor",
          "- flow ทั่วไป: C3 ไปจุดจ่าย → แล้วใช้ **C5 output-door** เปิดประตูตาม `doorNo`"
        ),
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
        summary: "C4 — micro-step จ่ายตามช่วงช่อง",
        description: d(
          "**SY600 `0xC4`** — สั่ง micro-step จ่ายที่เลเยอร์ + ช่วง channel.",
          "",
          "**Body**",
          "- `layer` — เลขเลเยอร์",
          "- `channelStart`, `channelEnd` — ช่วงช่อง (uint)",
          "- `repeat` *(optional)* — ส่งคำสั่งเดิมซ้ำกี่รอบต่อเนื่อง (1–100; default 1)",
          "",
          "**Response**",
          "- เมื่อ `repeat` > 1 จะได้ object ที่มีหลาย attempt (ดู implementation)"
        ),
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
        summary: "C5 — ประตูจ่าย (output door)",
        description: d(
          "**SY600 `0xC5`** — เปิด/ปิดประตูจ่ายด้าน output.",
          "",
          "**Body**",
          "- `action` — `0` = ปิด, `1` = เปิด",
          "- `doorNo` — หมายเลขประตู (1, 2, 3 … ตามเครื่อง)",
          "",
          "มักใช้หลังสั่งลิฟท์ไปจุดจ่ายด้วย **C3** (`target` 85/86/87)"
        ),
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
        summary: "C6 — สายพานทิศทางและเวลา",
        description: d(
          "**SY600 `0xC6`** — ควบคุมสายพาน / แพลตฟอร์ม.",
          "",
          "**Body**",
          "- `direction` — `0` = forward, `1` = reverse",
          "- `seconds` — วินาทีที่ให้วิ่ง (`0` = ใช้ค่า default ของอุปกรณ์)"
        ),
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
        summary: "C7 — ประตูรับ (pickup door)",
        description: d(
          "**SY600 `0xC7`** — เปิด/ปิดประตูฝั่งรับสินค้า (pickup).",
          "",
          "**Body**",
          "- `action` — `0` = ปิด, `1` = เปิด",
          "- `doorNo` — หมายเลขประตู"
        ),
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
        summary: "0x24 — รีเซ็ตประตู/ลิฟท์ + scan ข้อมูลเครื่อง",
        description: d(
          "**SY600 `0x24`** — รีเซ็ตชิ้นส่วนที่เลือก แล้วอ่านข้อมูลโครงสร้าง/สแกนของเครื่อง.",
          "",
          "**Body**",
          "- `resetDoor` — `1` = รีเซ็ตประตู, `0` = ไม่ทำ",
          "- `resetLift` — `1` = รีเซ็ตลิฟท์, `0` = ไม่ทำ"
        ),
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
        summary: "0x35 — อ่านสถานะ IR / hall",
        description: d(
          "**SY600 `0x35`** — อ่านเซนเซอร์หนึ่งตัวตามประเภท.",
          "",
          "**Body:** `{ \"sensorType\": 0..7 }`",
          "",
          "| sensorType | ความหมาย |",
          "|--------------|-----------|",
          "| 0 | drop sensor |",
          "| 1 | platform1 |",
          "| 2 | anti-pinch1 |",
          "| 3 | reserved |",
          "| 4 | platform2 |",
          "| 5 | anti-pinch2 |",
          "| 6 | platform3 |",
          "| 7 | anti-pinch3 |"
        ),
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
        summary: "0x39 — อ่าน microswitch ทั้งชุด",
        description: d(
          "**SY600 `0x39`** — อ่านสถานะสวิตช์/เซนเซอร์แบบ map เต็ม.",
          "",
          "**ไม่มี body**",
          "",
          "**Response**",
          "- `dataBytes[0]` = จำนวนเซนเซอร์ (หรือ count ตาม decode)",
          "- byte ถัดไปเรียงลำดับคงที่ — ค่า **`0` = Normal**, **`1` = Blocked**",
          "",
          "**ลำดับชื่อ (reference)**",
          "pickupDoor1Up, pickupDoor1Down, antiPinch1, outputDoor1Up, outputDoor1Down,",
          "pickupDoor2Up, pickupDoor2Down, antiPinch2, outputDoor2Up, outputDoor2Down,",
          "pickupDoor3Up, pickupDoor3Down, antiPinch3, outputDoor3Up, outputDoor3Down"
        ),
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        tags: ["SY600"],
        summary: "0x39 — microswitch (deprecated)",
        description: d(
          "**Deprecated** — ใช้ **GET** `/sy600/39/microswitch` แทน.",
          "",
          "พฤติกรรมเดียวกับ GET (อ่านรายการสวิตช์ทั้งชุด). ดูรายละเอียดลำดับ byte ที่ GET operation."
        ),
        responses: {
          200: { description: "Command result", content: { "application/json": { schema: { $ref: "#/components/schemas/Sy600Response" } } } },
          500: { description: "Serial failure", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/sy600/28/dispense": {
      post: {
        tags: ["SY600"],
        summary: "0x28 — สั่งจ่ายตามช่อง + order id",
        description: d(
          "**SY600 `0x28`** — สั่งจ่ายตามช่วง channel พร้อม order id 8 byte.",
          "",
          "**Body**",
          "- `layerAddressHex` *(optional)* — ที่อยู่เลเยอร์ 8 hex chars; ถ้าไม่ส่งใช้ `SY600_DEVICE_ADDRESS_HEX`",
          "- `channelStart`, `channelEnd`",
          "- `orderIdHex` — **ต้อง 16 hex characters** (= 8 bytes)",
          "",
          "เฟรมจะ patch address ใน header ตาม `layerAddressHex` เมื่อระบุ"
        ),
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
        summary: "0xE0 — ACK รายงานข้อผิดพลาด",
        description: d(
          "**SY600 `0xE0`** — acknowledge รายงานข้อผิดพลาดแบบ active เพื่อให้เครื่องหยุดส่งซ้ำ.",
          "",
          "**Body** *(optional)*",
          "- `addressHex` — 8 hex chars; ถ้าไม่ส่ง ใช้ `SY600_DEVICE_ADDRESS_HEX` จาก env"
        ),
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
    securitySchemes: {
      ApiBearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description:
          "ค่าเดียวกับ `API_BEARER_TOKEN` ใน env — ใส่ใน Swagger ผ่านปุ่ม Authorize เมื่อเซิร์ฟเวอร์ตั้ง token แล้ว " +
          "(ตั้ง `API_BEARER_REQUIRED=true` ใน production เพื่อบังคับมี token ก่อนรัน)",
      },
    },
    schemas: {
      LogFileEntry: {
        type: "object",
        properties: {
          name: { type: "string", example: "events-http.log" },
          size: { type: "number", example: 1024 },
          mtimeMs: { type: "number", example: 1715412345678 },
          compressed: { type: "boolean", example: false },
        },
        required: ["name", "size", "mtimeMs", "compressed"],
      },
      LogsCategoryEntry: {
        type: "object",
        properties: {
          id: { type: "string", example: "http" },
          activeFile: { type: "string", example: "events-http.log" },
          activeSizeBytes: { type: "number", nullable: true },
          activeMtimeMs: { type: "number", nullable: true },
          files: { type: "array", items: { $ref: "#/components/schemas/LogFileEntry" } },
        },
        required: ["id", "activeFile", "files"],
      },
      LogsListResponse: {
        type: "object",
        properties: {
          dir: { type: "string", example: "logs" },
          categories: { type: "array", items: { $ref: "#/components/schemas/LogsCategoryEntry" } },
        },
        required: ["dir", "categories"],
      },
      LogTailResponse: {
        type: "object",
        properties: {
          category: { type: "string" },
          file: { type: "string" },
          linesRequested: { type: "integer" },
          lineCount: { type: "integer" },
          totalFileBytes: { type: "number" },
          truncatedFromStartBytes: { type: "number", nullable: true },
          partialFirstLine: { type: "boolean" },
          uncompressedApproxBytes: { type: "number", description: "Present for .gz reads" },
          lines: { type: "array", items: { type: "string" }, description: "Raw text lines (JSONL as strings)" },
        },
        required: ["category", "file", "linesRequested", "lineCount", "totalFileBytes", "lines"],
      },
      HealthAlert: {
        type: "object",
        properties: {
          level: { type: "string", example: "warning", description: "Severity hint" },
          source: { type: "string", example: "serial:vending", description: "Origin of the alert" },
          message: { type: "string", example: "Port is not connected" },
        },
        required: ["level", "source", "message"],
      },
      HealthSummary: {
        type: "object",
        properties: {
          systemStatus: { type: "string", enum: ["ok", "degraded"], example: "ok" },
          alertsCount: { type: "number", example: 0 },
          serial: {
            type: "object",
            properties: {
              ready: { type: "boolean" },
              connectedPorts: { type: "number" },
              totalPorts: { type: "number" },
            },
          },
          mqtt: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              connected: { type: "boolean" },
            },
          },
          sy600: {
            type: "object",
            properties: {
              deviceAddressHex: { type: "string", example: "AABBCCDD" },
              useCrc16: { type: "boolean", example: false },
            },
          },
        },
        required: ["systemStatus", "alertsCount", "serial", "mqtt", "sy600"],
      },
      SerialWriteQueueJob: {
        type: "object",
        description: "One queued serial write: human label + TX hex (bytes to send on wire)",
        properties: {
          label: { type: "string", example: "sy600-0xC3" },
          txHex: {
            type: "string",
            nullable: true,
            example: "EE01AABBCCDDC3000201000000",
            description: "Even-length uppercase hex (same as vending `data` or built SY600 frame / nav JSON line as hex)",
          },
        },
        required: ["label"],
      },
      SerialWriteQueueChannelSnapshot: {
        type: "object",
        description:
          "Per-channel serial write queue (FIFO). `waitingJobs` / `runningJob` pair each job with **txHex**; " +
          "`waitingLabels` mirrors labels only for backward compatibility.",
        properties: {
          queueKey: {
            type: "string",
            nullable: true,
            description: "COM / device path used as internal queue key (usually actualPath or configuredPath)",
          },
          runningLabel: {
            type: "string",
            nullable: true,
            example: "sy600-0xC3",
            description: "Shorthand: `runningJob.label`",
          },
          runningTxHex: {
            type: "string",
            nullable: true,
            description: "Shorthand: `runningJob.txHex`",
          },
          runningJob: {
            type: "object",
            nullable: true,
            description: "Job currently executing on this COM (null if idle); same shape as SerialWriteQueueJob",
            properties: {
              label: { type: "string", example: "sy600-0xC3" },
              txHex: { type: "string", nullable: true, example: "EE01AABBCCDDC3000201000000" },
            },
          },
          waitingLabels: {
            type: "array",
            items: { type: "string" },
            example: ["sy600-0xC3", "sy600-0xC3"],
            description: "Labels only, head → tail (same order as `waitingJobs`)",
          },
          waitingJobs: {
            type: "array",
            items: { $ref: "#/components/schemas/SerialWriteQueueJob" },
            description: "Waiting jobs with **txHex** each (head → tail)",
          },
          waitingTxHex: {
            type: "array",
            items: { type: "string", nullable: true },
            description: "Parallel array of hex for `waitingLabels` (same index order)",
          },
          waitingCount: { type: "number", example: 2 },
          busy: { type: "boolean", example: true },
          note: { type: "string", description: "Only on qr-nfc: explains no write queue" },
        },
      },
      SerialWriteQueuesSnapshot: {
        type: "object",
        description:
          "Per-COM serial write queue snapshot: running + waiting jobs, each with **txHex** (same data as console queue logs).",
        properties: {
          channels: {
            type: "object",
            properties: {
              vending: { $ref: "#/components/schemas/SerialWriteQueueChannelSnapshot" },
              navigationLights: { $ref: "#/components/schemas/SerialWriteQueueChannelSnapshot" },
              qrNfc: { $ref: "#/components/schemas/SerialWriteQueueChannelSnapshot" },
            },
          },
          activeQueueKeys: {
            type: "array",
            items: { type: "string" },
            description: "Internal Map keys that currently hold queue state (debug path mismatches)",
          },
        },
      },
      SerialChannelHealth: {
        type: "object",
        description: "Per-channel merge of `.env` path/baud with live port state",
        properties: {
          path: { type: "string", example: "COM6" },
          baudRate: { type: "number", example: 9600 },
          channel: { type: "string", example: "vending" },
          configuredPath: { type: "string" },
          configuredBaudRate: { type: "number" },
          isConfigured: { type: "boolean" },
          isConnected: { type: "boolean" },
          serialReady: { type: "boolean" },
          isReconnectScheduled: { type: "boolean" },
          actualPath: { type: "string", nullable: true },
          bytesRead: { type: "number", nullable: true },
          bytesWritten: { type: "number", nullable: true },
          readable: { type: "boolean", nullable: true },
          writable: { type: "boolean", nullable: true },
          lastConnectedAt: { type: "string", nullable: true },
          lastWriteAt: { type: "string", nullable: true },
          lastError: { type: "string", nullable: true },
        },
      },
      NodeMemoryUsage: {
        type: "object",
        description: "Node.js `process.memoryUsage()` (values in bytes)",
        additionalProperties: { type: "number" },
      },
      HealthDevices: {
        type: "object",
        properties: {
          serial: {
            type: "object",
            properties: {
              summary: {
                type: "object",
                properties: {
                  serialReady: { type: "boolean" },
                  connectedPorts: { type: "number" },
                  totalPorts: { type: "number" },
                },
              },
              channels: {
                type: "object",
                properties: {
                  vending: { $ref: "#/components/schemas/SerialChannelHealth" },
                  navigationLights: { $ref: "#/components/schemas/SerialChannelHealth" },
                  qrNfc: { $ref: "#/components/schemas/SerialChannelHealth" },
                },
              },
              writeQueues: { $ref: "#/components/schemas/SerialWriteQueuesSnapshot" },
            },
          },
          mqtt: {
            type: "object",
            description: "MQTT client snapshot plus resolved topic routing",
            additionalProperties: true,
          },
          sy600: {
            type: "object",
            properties: {
              transport: {
                type: "object",
                properties: {
                  portPath: { type: "string", description: "Vending serial path used for SY600 frames" },
                  baudRate: { type: "number" },
                },
              },
              protocol: {
                type: "object",
                properties: {
                  startTx: { type: "string", example: "0xEE" },
                  startRx: { type: "string", example: "0xFF" },
                  version: { type: "string", example: "0x01" },
                  deviceAddressHex: { type: "string" },
                  useCrc16: { type: "boolean" },
                },
              },
            },
          },
        },
      },
      HealthDiagnostics: {
        type: "object",
        properties: {
          process: {
            type: "object",
            properties: {
              uptimeSeconds: { type: "number", example: 120 },
              nodeVersion: { type: "string", example: "v24.13.1" },
              pid: { type: "number", example: 12345 },
              memoryUsage: { $ref: "#/components/schemas/NodeMemoryUsage" },
            },
          },
          serialPolicy: {
            type: "object",
            properties: {
              writeTimeoutMs: { type: "number", description: "SERIAL_WRITE_TIMEOUT_MS" },
              apiTimeoutMs: { type: "number", description: "SERIAL_API_TIMEOUT_MS (vending write HTTP socket)" },
              navigationLightsRetry: {
                type: "object",
                properties: {
                  maxRetry: { type: "number", description: "SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY" },
                  retryDelayMs: { type: "number", description: "SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS" },
                },
              },
              portQueueConsoleLog: {
                type: "boolean",
                description: "SERIAL_PORT_QUEUE_LOG — mirror queue events to console",
              },
            },
          },
          appTime: {
            type: "object",
            properties: {
              now: { type: "string", format: "date-time" },
              timezone: { type: "string", example: "Asia/Bangkok" },
            },
          },
        },
      },
      JobQueueResponse: {
        type: "object",
        properties: {
          timestamp: { type: "string", format: "date-time" },
          writeQueues: { $ref: "#/components/schemas/SerialWriteQueuesSnapshot" },
          portQueueConsoleLog: {
            type: "boolean",
            description: "SERIAL_PORT_QUEUE_LOG — queue events mirrored to console when true",
          },
        },
        required: ["timestamp", "writeQueues", "portQueueConsoleLog"],
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok", "degraded"], example: "ok" },
          timestamp: { type: "string", format: "date-time" },
          summary: { $ref: "#/components/schemas/HealthSummary" },
          devices: { $ref: "#/components/schemas/HealthDevices" },
          diagnostics: { $ref: "#/components/schemas/HealthDiagnostics" },
          alerts: {
            type: "array",
            items: { $ref: "#/components/schemas/HealthAlert" },
            description: "Warnings for disconnected serial channels and MQTT misconfiguration",
          },
        },
        required: ["status", "timestamp", "summary", "devices", "diagnostics", "alerts"],
      },
      SerialWriteRequest: {
        type: "object",
        properties: {
          data: {
            type: "string",
            example: "ee01aabbccddc30002000052c6",
            description: d(
              "String hex ความยาว**คู่** — แปลงเป็น raw bytes ส่งพอร์ต vending",
              "",
              "- ช่องว่างใน string จะถูกลบก่อนส่ง",
              "- รอ RX หลังส่ง (ดู `SERIAL_WRITE_TIMEOUT_MS`)"
            ),
          },
        },
        required: ["data"],
      },
      SerialWriteResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          bytes: { type: "number", example: 4, description: "TX byte count written to the port" },
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
      NavigationLightsWaitResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          accepted: {
            type: "object",
            additionalProperties: true,
            example: { act: "led", cmd: [1, 165, 0, 128, 0, 1] },
            description: "Echo of request `data` after successful RX wait",
          },
          serialResponse: { $ref: "#/components/schemas/SerialWriteResponse" },
        },
        required: ["success", "accepted", "serialResponse"],
      },
      NavigationLightsWriteRequest: {
        type: "object",
        properties: {
          data: {
            type: "object",
            additionalProperties: true,
            example: { act: "led", cmd: [1, 165, 0, 128, 0, 1] },
            description: d(
              "คำสั่ง navigation lights (object ใดก็ได้ที่อุปกรณ์เข้าใจ).",
              "",
              "**รูปแบบ LED ทั่วไป**",
              "- `act`: `\"led\"`",
              "- `cmd`: array 6 ตัวเลข —",
              "  `[ หลอดเริ่ม, หลอดสุดท้าย, R, G, B, mode ]`",
              "",
              "  • R,G,B: 0–255",
              "  • mode: `0` = เปิดค้าง, `1` = กระพริบ",
              "",
              "**การส่ง**",
              "- serialize เป็น JSON หนึ่งบรรทัด + newline แล้วส่งทาง serial"
            ),
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
            description: d(
              "ข้อมูลถอดรหัสแล้ว — แตกต่างตาม `command`",
              "",
              "**ตัวอย่าง `0x39`**",
              "- `decoded.microswitchCount` และ `decoded.statusBytes`",
              "- ค่าใน status: `0` = Normal, `1` = Blocked",
              "",
              "ดู operation ของแต่ละคำสั่งสำหรับฟิลด์อื่น"
            ),
          },
        },
        required: ["txHex", "response"],
      },
      Sy600C3Request: {
        type: "object",
        properties: {
          target: {
            type: "number",
            example: 85,
            description: d(
              "ตำแหน่งลิฟท์ (byte เดียวในเฟรม):",
              "",
              "- `0` — รีเซ็ต / origin",
              "- `1` … `7` — ชั้นคลัง",
              "- **`85`**, **`86`**, **`87`** — จุดส่งของ / output (`0x55` … `0x57`); มักคู่ประตูจ่าย 1–3"
            ),
          },
        },
        required: ["target"],
      },
      Sy600C4Request: {
        type: "object",
        properties: {
          layer: { type: "number", example: 1, description: "เลขเลเยอร์" },
          channelStart: { type: "number", example: 0, description: "ช่องเริ่ม (uint)" },
          channelEnd: { type: "number", example: 5, description: "ช่องสิ้นสุด (uint)" },
          repeat: {
            type: "number",
            example: 3,
            description: d(
              "*(optional)* จำนวนรอบส่งคำสั่งเดิมซ้ำ (integer 1–100)",
              "",
              "ถ้าไม่ส่ง = 1 รอบ"
            ),
          },
        },
        required: ["layer", "channelStart", "channelEnd"],
      },
      Sy600DoorRequest: {
        type: "object",
        properties: {
          action: {
            type: "number",
            example: 1,
            description: d(
              "`0` = ปิด (close)",
              "`1` = เปิด (open)"
            ),
          },
          doorNo: { type: "number", example: 1, description: "หมายเลขประตู (1-based ตามเครื่อง)" },
        },
        required: ["action", "doorNo"],
      },
      Sy600C6Request: {
        type: "object",
        properties: {
          direction: {
            type: "number",
            example: 0,
            description: d(
              "`0` = forward",
              "`1` = reverse"
            ),
          },
          seconds: {
            type: "number",
            example: 3,
            description: d(
              "วินาทีที่ให้มอเตอร์/สายพานวิ่ง",
              "",
              "`0` = ใช้เวลา default ของอุปกรณ์"
            ),
          },
        },
        required: ["direction", "seconds"],
      },
      Sy600ResetScanRequest: {
        type: "object",
        properties: {
          resetDoor: {
            type: "number",
            example: 1,
            description: "`1` = รีเซ็ตประตู, `0` = ไม่รีเซ็ต",
          },
          resetLift: {
            type: "number",
            example: 1,
            description: "`1` = รีเซ็ตลิฟท์, `0` = ไม่รีเซ็ต",
          },
        },
        required: ["resetDoor", "resetLift"],
      },
      Sy600InfraredRequest: {
        type: "object",
        properties: {
          sensorType: {
            type: "number",
            example: 0,
            description: d(
              "ประเภทเซนเซอร์ IR / hall:",
              "",
              "| ค่า | ความหมาย |",
              "|-----|-----------|",
              "| 0 | drop sensor |",
              "| 1 | platform1 |",
              "| 2 | anti-pinch1 |",
              "| 3 | reserved |",
              "| 4 | platform2 |",
              "| 5 | anti-pinch2 |",
              "| 6 | platform3 |",
              "| 7 | anti-pinch3 |"
            ),
          },
        },
        required: ["sensorType"],
      },
      Sy600DispenseRequest: {
        type: "object",
        properties: {
          layerAddressHex: {
            type: "string",
            example: "AABBCCDD",
            description: d(
              "*(optional)* ที่อยู่เลเยอร์ 8 hex chars",
              "",
              "ถ้าไม่ส่ง → ใช้ `SY600_DEVICE_ADDRESS_HEX`"
            ),
          },
          channelStart: { type: "number", example: 0 },
          channelEnd: { type: "number", example: 0 },
          orderIdHex: {
            type: "string",
            example: "0011223344556677",
            description: d(
              "**บังคับ** — 16 hex characters (= 8 bytes) order id",
              "",
              "ตัวอย่าง: `0011223344556677`"
            ),
          },
        },
        required: ["channelStart", "channelEnd", "orderIdHex"],
      },
      Sy600E0AckRequest: {
        type: "object",
        properties: {
          addressHex: {
            type: "string",
            example: "AABBCCDD",
            description: d(
              "*(optional)* device address 8 hex chars สำหรับ patch ในเฟรม",
              "",
              "ถ้าไม่ส่ง → ใช้ `SY600_DEVICE_ADDRESS_HEX`"
            ),
          },
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

if (API_BEARER_TOKEN) {
  swaggerSpec.security = [{ ApiBearerAuth: [] }];
}

export function setupSwagger(app) {
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      persistAuthorization: true,
    })
  );
}
