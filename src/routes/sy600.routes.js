import { Router } from "express";
import {
  sy600AckE0Controller,
  sy600CabinetCompressorController,
  sy600CabinetCompressorTemperatureController,
  sy600CabinetLightsController,
  sy600CabinetStatusController,
  sy600ChannelDispenseController,
  sy600ConveyorController,
  sy600InfraredController,
  sy600LiftController,
  sy600MicroswitchController,
  sy600MicroStepController,
  sy600OutputDoorController,
  sy600PickupDoorController,
  sy600ResetScanController,
} from "../controllers/sy600.controller.js";

/**
 * SY600 vending protocol — HTTP ชั้นบนของเฟรม binary (ส่งผ่านพอร์ต vending serial).
 *
 * Prefix จริง: /api/v1  (ดู app mount)
 *
 * ค่าเริ่มต้นเฟรม: `SY600_DEVICE_ADDRESS_HEX`, `SY600_USE_CRC16` ใน .env
 */

const sy600Router = Router();

// =============================================================================
// POST /sy600/c3/lift  — คุมตำแหน่งลิฟท์ / ชั้น / จุดจ่าย
// =============================================================================
// Body: { "target": <number> }
//
// | target (ตัวเลขที่ส่งใน JSON) | hex   | ใช้ทำอะไร (โดยทั่วไป) |
// |-----------------------------|-------|------------------------|
// | 0                           | 0x00  | รีเซ็ต / จุดอ้างอิง     |
// | 1 … 7                       | 0x01… | ชั้นคลัง (บน/ล่างตามคู่มือเครื่อง) |
// | 85, 86, 87                  | 0x55, 0x56, 0x57 | จุดส่งของ / จุดจ่าย (มัก map กับประตูจ่าย 1–3; ยืนยันกับ vendor) |
//
// หมายเหตุ: พาไป “จุดส่งของ” ใช้ target 85/86/87 แล้วมักตามด้วย C5 output-door
//           ตาม doorNo ที่ตรงกับประตูนั้น
// =============================================================================
sy600Router.post("/sy600/c3/lift", sy600LiftController);

// =============================================================================
// POST /sy600/c4/micro-step  — สั่ง micro-step จ่ายตามช่วงช่อง
// =============================================================================
// Body:
//   {
//     "layer": <1..255>,
//     "channelStart": <uint>,
//     "channelEnd": <uint>,
//     "repeat": <optional 1..100>
//   }
//
// repeat — จำนวนรอบส่งคำสั่งเดิมซ้ำต่อเนื่อง (ค่าเริ่มต้น 1 ถ้าไม่ส่ง)
// =============================================================================
sy600Router.post("/sy600/c4/micro-step", sy600MicroStepController);

// =============================================================================
// POST /sy600/c5/output-door  — เปิด/ปิด ประตูจ่าย (output)
// =============================================================================
// Body: { "action": 0|1, "doorNo": <1..255> }
//
//   action: 0 = ปิด, 1 = เปิด
// =============================================================================
sy600Router.post("/sy600/c5/output-door", sy600OutputDoorController);

// =============================================================================
// POST /sy600/c6/conveyor  — สายพาน / แพลตฟอร์ม ทิศทางและเวลา
// =============================================================================
// Body: { "direction": 0|1, "seconds": <0..255> }
//
//   direction: 0 = forward, 1 = reverse
//   seconds:   0 = ใช้เวลา default ของอุปกรณ์
// =============================================================================
sy600Router.post("/sy600/c6/conveyor", sy600ConveyorController);

// =============================================================================
// POST /sy600/c7/pickup-door  — เปิด/ปิด ประตูรับ (pickup)
// =============================================================================
// Body: { "action": 0|1, "doorNo": <1..255> }
//
//   action: 0 = ปิด, 1 = เปิด
// =============================================================================
sy600Router.post("/sy600/c7/pickup-door", sy600PickupDoorController);

// =============================================================================
// POST /sy600/24/reset-scan  — รีเซ็ตประตู/ลิฟท์ และอ่านข้อมูลโครงสร้างเครื่อง
// =============================================================================
// Body: { "resetDoor": 0|1, "resetLift": 0|1 }
//
//   1 = ให้รีเซ็ต, 0 = ข้าม
// =============================================================================
sy600Router.post("/sy600/24/reset-scan", sy600ResetScanController);

// =============================================================================
// POST /sy600/35/infrared  — อ่านสถานะ IR / hall ตามประเภทเซนเซอร์
// =============================================================================
// Body: { "sensorType": 0..7 }
//
//   0 = drop
//   1 = platform1
//   2 = anti-pinch1
//   3 = reserved
//   4 = platform2
//   5 = anti-pinch2
//   6 = platform3
//   7 = anti-pinch3
// =============================================================================
sy600Router.post("/sy600/35/infrared", sy600InfraredController);

// =============================================================================
// GET  /sy600/39/microswitch  — อ่านชุดสถานะ microswitch (แนะนำ)
// POST /sy600/39/microswitch  — คู่ความเข้ากันเก่า (deprecated)
// =============================================================================
// ไม่มี body (GET). ลำดับ byte ใน response ตาม decode ใน sy600.service / Swagger
// =============================================================================
sy600Router.get("/sy600/39/microswitch", sy600MicroswitchController);
sy600Router.post("/sy600/39/microswitch", sy600MicroswitchController);

// =============================================================================
// POST /sy600/28/dispense  — สั่งจ่ายตามช่วงช่อง + order id 8 byte
// =============================================================================
// Body:
//   {
//     "layerAddressHex": "AABBCCDD",   // optional; default จาก env
//     "channelStart": <uint>,
//     "channelEnd": <uint>,
//     "orderIdHex": "0011223344556677"  // ต้อง 16 hex chars = 8 bytes
//   }
// =============================================================================
sy600Router.post("/sy600/28/dispense", sy600ChannelDispenseController);

// =============================================================================
// POST /sy600/e0/ack  — ACK รายงานข้อผิดพลาดแบบ active (หยุดรายงานซ้ำ)
// =============================================================================
// Body (optional): { "addressHex": "AABBCCDD" }
//
// ถ้าไม่ส่ง addressHex ใช้ค่า SY600_DEVICE_ADDRESS_HEX จาก env
// =============================================================================
sy600Router.post("/sy600/e0/ack", sy600AckE0Controller);

// =============================================================================
// POST /sy600/cabinet/lights  — เปิด/ปิดไฟในตู้ (0x43: [lamp, state])
// =============================================================================
// Body: { "on": true|false, "lamp"?: 1|2 (default 1), "addressHex"?: "AABBCCDD" }
// =============================================================================
sy600Router.post("/sy600/cabinet/lights", sy600CabinetLightsController);

// =============================================================================
// GET/POST /sy600/cabinet/status  — สถานะอุปกรณ์ในตู้ทั้งหมด (0x44)
// =============================================================================
// ตอบ: lights1On, lights2On, glassHeaterOn, compressorCoolingOn,
//      compressorHeatingOn, doorOpen, defrosting
// =============================================================================
sy600Router.get("/sy600/cabinet/status", sy600CabinetStatusController);
sy600Router.post("/sy600/cabinet/status", sy600CabinetStatusController);

// =============================================================================
// POST /sy600/cabinet/compressor  — เปิด/ปิดคอมเพรสเซอร์ (เฟรมจับจากสนาม 0x4A)
// =============================================================================
// Body: { "on": true|false, "addressHex"?: "AABBCCDD" }
// =============================================================================
sy600Router.post("/sy600/cabinet/compressor", sy600CabinetCompressorController);

// =============================================================================
// POST /sy600/cabinet/compressor/temperature  — ตั้งจุดอุณหภูมิ (°C) หรืออ่านค่าที่ตั้ง
// =============================================================================
// Body อย่างใดอย่างหนึ่ง:
//   { "read": true, "addressHex"?: "AABBCCDD" }
//   { "celsius": <0..255>, "addressHex"?: "AABBCCDD" }
// =============================================================================
sy600Router.post("/sy600/cabinet/compressor/temperature", sy600CabinetCompressorTemperatureController);

export default sy600Router;
