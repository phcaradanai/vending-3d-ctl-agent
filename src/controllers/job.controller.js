import { getSerialHealthSnapshot, getSerialWriteQueueSnapshot } from "../services/serial.service.js";
import { SERIAL_PORT_QUEUE_LOG } from "../config/env.js";

/**
 * Serial write queue snapshot only (same data as `devices.serial.writeQueues` on `/health`).
 */
export async function jobQueueController(_req, res) {
  const serialHealth = getSerialHealthSnapshot();
  return res.json({
    timestamp: new Date().toISOString(),
    writeQueues: getSerialWriteQueueSnapshot(serialHealth.ports),
    portQueueConsoleLog: SERIAL_PORT_QUEUE_LOG,
  });
}
