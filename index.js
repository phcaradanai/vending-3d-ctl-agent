/**
 * Process entry — HTTP API for vending serial / MQTT control.
 * Release version: `package.json` → `version` (ISO/IEC 29110-4/5 Basic profile — SCI traceability).
 */
import app from "./src/app.js";
import {
  APP_LOG_AGENT_ENABLED,
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
import { logAgent } from "./src/logger/logAgent.js";
import { getSoftwareIdentification } from "./src/config/softwareIdentification.js";

async function bootstrap() {
  const softwareIdentification = getSoftwareIdentification();
  if (!APP_LOG_AGENT_ENABLED) {
    console.warn(
      "[logAgent] File logging is off (APP_LOG_AGENT_ENABLED). No events-*.log JSON lines will be written under ./logs."
    );
  }
  logAgent.app({
    event: "app.bootstrap.start",
    softwareIdentification,
    port: PORT,
    vending: SERIAL_VENDING,
    navigationLights: SERIAL_NAVIGATION_LIGHTS,
    qrNfc: SERIAL_QR_NFC,
  });
  initializeMqttPublisher();
  await initializeSerialListeners();

  app.listen(PORT, () => {
    console.log(
      `v${softwareIdentification.version} (${softwareIdentification.configurationItemId}) — ISO/IEC 29110-4/5 Basic profile
API listening on port ${PORT}
      vending: ${SERIAL_VENDING} @${SERIAL_VENDING_BAUD_RATE}  Serial Write Timeout: ${SERIAL_WRITE_TIMEOUT_MS}ms
      navigation-lights: ${SERIAL_NAVIGATION_LIGHTS} @${SERIAL_NAVIGATION_LIGHTS_BAUD_RATE}
      qr-nfc: ${SERIAL_QR_NFC} @${SERIAL_QR_NFC_BAUD_RATE}`
    );
    logAgent.app({
      event: "app.http.listening",
      softwareIdentification,
      port: PORT,
      vending: SERIAL_VENDING,
      navigationLights: SERIAL_NAVIGATION_LIGHTS,
      qrNfc: SERIAL_QR_NFC,
    });
  });
}

bootstrap().catch((error) => {
  console.error(`Application bootstrap failed: ${error.message}`);
  logAgent.error({
    event: "app.bootstrap.failed",
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
