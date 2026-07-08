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
