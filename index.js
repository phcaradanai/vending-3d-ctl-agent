import app from "./src/app.js";
import {
  PORT,
  SERIAL_NAVIGATION_LIGHTS,
  SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  SERIAL_VENDING,
  SERIAL_VENDING_BAUD_RATE,
  SERIAL_QR_NFC,
  SERIAL_QR_NFC_BAUD_RATE,
  SERIAL_WRITE_TIMEOUT_MS,
} from "./src/config/env.js";
import { initializeMqttPublisher } from "./src/services/mqtt.service.js";
import { initializeSerialListeners } from "./src/services/serial.service.js";

async function bootstrap() {
  initializeMqttPublisher();
  await initializeSerialListeners();

  app.listen(PORT, () => {
    console.log(
      `API listening on port ${PORT}
      vending: ${SERIAL_VENDING} @${SERIAL_VENDING_BAUD_RATE}  Serial Write Timeout: ${SERIAL_WRITE_TIMEOUT_MS}ms
      navigation-lights: ${SERIAL_NAVIGATION_LIGHTS} @${SERIAL_NAVIGATION_LIGHTS_BAUD_RATE}
      qr-nfc: ${SERIAL_QR_NFC} @${SERIAL_QR_NFC_BAUD_RATE}`
    );
  });
}

bootstrap().catch((error) => {
  console.error(`Application bootstrap failed: ${error.message}`);
  process.exit(1);
});
