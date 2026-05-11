import { Router } from "express";
import {
  writeNavigationLightsSerialNoWaitController,
  writeNavigationLightsSerialController,
  writeVendingSerialController,
} from "../controllers/serial.controller.js";
import { SERIAL_API_TIMEOUT_MS } from "../config/env.js";
import {
  validateSerialWrite,
  validateSerialWriteNavigationLights,
} from "../middleware/validateSerialWrite.middleware.js";

/**
 * Serial HTTP routes (prefix จริง: /api/v1)
 *
 * - vending: ส่งเป็น hex string → raw bytes + รอ RX
 * - navigation-lights: ส่งเป็น JSON object → serialize เป็นบรรทัดเดียว ต่อท้าย newline แล้วส่ง
 */

const serialRouter = Router();

function setVendingWriteApiTimeout(req, res, next) {
  req.setTimeout(SERIAL_API_TIMEOUT_MS);
  res.setTimeout(SERIAL_API_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(504).json({
        error: "Request timeout",
        details: `API timeout after ${SERIAL_API_TIMEOUT_MS} ms`,
      });
    }
  });
  next();
}

// =============================================================================
// POST /serial/vending/write
// =============================================================================
// Body: { "data": "<even-length hex>" }
//
// - ช่องว่างใน hex ตัดทิ้งก่อนส่ง
// - รอ RX หลังส่ง (idle ~80ms หรือ SERIAL_WRITE_TIMEOUT_MS)
// - HTTP socket timeout ใช้ SERIAL_API_TIMEOUT_MS (ควร ≥ SERIAL_WRITE_TIMEOUT_MS)
//
// ตัวอย่าง hex (อ้างอิง SY600 — ต้องตรงกับเฟรมจริงของเครื่อง):
//   ลิฟท์รีเซ็ต / จุดเริ่ม     → ดูคู่มือ + ใช้ SY600 API แทนถ้าเป็นเฟรมมาตรฐาน
//   ลิฟท์ไปชั้น / จุดจ่าย      → แนะนำ POST /api/v1/sy600/c3/lift แทนการประกอบ hex มือ
//
// ตัวอย่าง body:
//   { "data": "ee01aabbccddc3000205005196" }
// =============================================================================
serialRouter.post(
  "/serial/vending/write",
  setVendingWriteApiTimeout,
  validateSerialWrite,
  writeVendingSerialController
);

// =============================================================================
// POST /serial/navigation-lights/write
// =============================================================================
// Body: { "data": { ... } }   // object ใดก็ได้ที่อุปกรณ์อ่าน; ทั่วไปใช้ act "led"
//
// เมื่อ act === "led" ฟิลด์ cmd เป็น array 6 ตัวเลข:
//
//   [ หลอดเริ่มต้น, หลอดสุดท้าย, R, G, B, mode ]
//
//   • index 0,1 — ช่วง index LED บนแถบ (รวมปลายทั้งสอง)
//   • index 2,3,4 — สี R,G,B ช่วง 0..255
//   • index 5 — mode: 0 = เปิดค้าง (steady), 1 = กระพริบ (flash)
//
// การส่งจริง: JSON.stringify(data) ต่อท้าย newline → bytes ไปที่พอร์ต navigation
// รอ RX + retry on timeout ตาม SERIAL_NAVIGATION_LIGHTS_* env
//
// ตัวอย่าง:
//   { "data": { "act": "led", "cmd": [1, 165, 0, 128, 0, 1] } }
//
// Response 200: { success, accepted, serialResponse } — ดู Swagger
// =============================================================================
serialRouter.post(
  "/serial/navigation-lights/write",
  validateSerialWriteNavigationLights,
  writeNavigationLightsSerialController
);

// =============================================================================
// POST /serial/navigation-lights/write-no-wait
// =============================================================================
// เหมือน write ด้านบนเรื่อง body และความหมาย cmd แต่ไม่รอ RX — ส่ง + drain แล้วตอบ
// ใช้เมื่อไม่ต้องการหรือไม่เสถียรเรื่องตอบกลับจากอุปกรณ์
// =============================================================================
serialRouter.post(
  "/serial/navigation-lights/write-no-wait",
  validateSerialWriteNavigationLights,
  writeNavigationLightsSerialNoWaitController
);

export default serialRouter;
