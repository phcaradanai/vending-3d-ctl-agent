import app from "./src/app.js";
import {
  PORT,
  SERIAL_NAVIGATION_LIGHTS,
  SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  SERIAL_VENDING,
  SERIAL_VENDING_BAUD_RATE,
} from "./src/config/env.js";
import { initializeSerialListeners } from "./src/services/serial.service.js";

async function bootstrap() {
  await initializeSerialListeners();

  app.listen(PORT, () => {
    console.log(
      `API listening on port ${PORT}
      vending: ${SERIAL_VENDING} @${SERIAL_VENDING_BAUD_RATE}
      navigation-lights: ${SERIAL_NAVIGATION_LIGHTS} @${SERIAL_NAVIGATION_LIGHTS_BAUD_RATE}`
    );
  });
}

bootstrap().catch((error) => {
  console.error(`Application bootstrap failed: ${error.message}`);
  process.exit(1);
});
