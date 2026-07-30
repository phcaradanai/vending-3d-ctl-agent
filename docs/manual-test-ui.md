# Manual Test UI

หน้า manual test อยู่ที่:

```text
http://127.0.0.1:3000/manual-test
```

ถ้าเปลี่ยน `PORT` ให้ใช้ port นั้นแทน `3000`.

## ใช้งาน

- `Base URL` คือ origin ของ API เช่น `http://127.0.0.1:3000`.
- `Bearer token` ใช้กับ endpoint ที่อยู่หลัง `API_BEARER_TOKEN`.
- แถบซ้ายเลือก command หรือ flow.
- ภาพเครื่องตรงกลาง highlight จุดที่ payload จะสั่ง เช่น LED range, slot layer/channel, lift target, door, sensor, compressor.
- ฝั่งขวาแสดง request body และ response ล่าสุด พร้อม history.

คำสั่งที่กระทบ hardware จะถามยืนยันก่อนส่งจาก UI.

## LED panel (navigation lights)

LED บนเครื่องจริง: **LED 1 อยู่มุมซ้ายล่าง** และทุกแถวเริ่มใหม่จากขอบซ้ายวิ่งไปขวา (ไม่วนกลับแบบ serpentine/U-arch). UI วาดตามผังนี้ ไม่ใช่แถบเดียวเรียงซ้าย→ขวา ดังนั้นช่วง LED บนจอตรงกับตำแหน่งจริงบนตู้ เช่น matrix 22 คอลัมน์: แถว 1 = LED 1-22, แถว 2 = LED 23-44, แถว 3 = LED 45-66.

- คลิก LED หนึ่งดวง = ตั้ง first/last LED เป็นดวงนั้น.
- ลากคลุม หรือ Shift-click = ตั้งเป็นช่วง (ค่าเขียนลง body ครั้งเดียวเมื่อปล่อยเมาส์).
- ช่อง `R` / `C` ข้างหัวข้อ Navigation LEDs ปรับขนาด matrix ได้ (default 5 rows × 22 cols) และจำค่าไว้ใน localStorage เช่นเดียวกับ `R`/`C` ของ slot grid.
- เซลล์ที่ index เกิน 165 (ความยาวเส้นจริง) แสดงเป็นเส้นประและกดไม่ได้.
- ถ้า matrix เล็กกว่า 165 ดวง (default 5×22 = 110) UI จะบอกไว้ใต้ panel ว่า `Matrix covers LED 1-110 of 165` และ label ช่วงจะต่อท้ายด้วย `· shown to 110` หรือ `· off panel` เมื่อช่วงที่สั่งอยู่นอกขอบเขตที่วาด — เพิ่ม `R`/`C` เพื่อให้ครอบคลุมทั้งเส้น (เช่น 5×33).
- สีที่ highlight ใช้ค่า R/G/B ใน `cmd` ของ payload ปัจจุบัน.

geometry อยู่ใน `public/manual-test/ledMatrix.js` (มี unit test ที่ `test/manual-test.ledMatrix.test.js`).

## Control inputs

ฟิลด์ตัวเลขใน control form แก้ค่าใน body โดยไม่สร้าง DOM ใหม่ ทำให้ caret/focus ไม่หลุดระหว่างพิมพ์:

- ลบค่าให้ว่างได้ ระหว่างนั้น body ยังคงค่าเดิม (ช่องว่างไม่ถูกตีเป็น 0).
- clamp min/max ทำตอน commit (`change`/blur) เท่านั้น จึงพิมพ์ `0` ในฟิลด์ที่ min เป็น 0 ได้ตามปกติ; ฟิลด์ที่ min เป็น 1 เช่น First/Last LED จะถูกดันขึ้นเป็น 1 ตอน commit.
- ปุ่ม `Reset body` สร้าง control form ใหม่จาก default body.

ถ้า JSON ใน body editor ผิดรูป ปุ่ม Send จะรายงาน `Invalid JSON` ใน drawer แทนที่จะเงียบ.

## Automated flow

รัน dry-run เพื่อดู step โดยไม่ยิง hardware:

```bash
npm run test:flow
```

รันกับ API จริง:

```bash
npm run test:flow -- --base-url http://127.0.0.1:3000 --flow preflight --execute
```

flow ที่ขยับหรือเขียน hardware ต้องยืนยันเพิ่ม:

```bash
npm run test:flow -- --flow navigation-light-sweep --execute --yes-hardware-risk
```

ใช้ token:

```bash
npm run test:flow -- --token <API_BEARER_TOKEN> --flow sensor-read --execute --yes-hardware-risk
```

## Unit tests

```bash
npm test
```

ชุดนี้ตรวจ command catalog, payload control paths, flow references, และ JSON serialization สำหรับ `/manual-test/commands.json`.
