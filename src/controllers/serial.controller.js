import {
  getSerialConfig,
  getSerialHealthSnapshot,
  writeNavigationLightsSerialData,
  writeVendingSerialData,
} from "../services/serial.service.js";

export function healthController(_req, res) {
  const serialConfig = getSerialConfig();
  const serialHealth = getSerialHealthSnapshot();

  res.json({
    status: serialHealth.serialReady ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    process: {
      uptimeSeconds: Number(process.uptime().toFixed(0)),
      nodeVersion: process.version,
      pid: process.pid,
    },
    serialReady: serialHealth.serialReady,
    serial: {
      summary: {
        serialReady: serialHealth.serialReady,
        connectedPorts: serialHealth.summary.connectedPorts,
        totalPorts: serialHealth.summary.totalPorts,
      },
      ports: {
        vending: {
          ...serialConfig.vending,
          ...serialHealth.ports.vending,
        },
        navigationLights: {
          ...serialConfig.navigationLights,
          ...serialHealth.ports.navigationLights,
        },
        qrNfc: {
          ...serialConfig.qrNfc,
          ...serialHealth.ports.qrNfc,
        },
      },
      writeTimeoutMs: serialConfig.writeTimeoutMs,
    },
  });
}

export async function writeVendingSerialController(req, res, next) {
  try {
    const result = await writeVendingSerialData(req.body.data);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function writeNavigationLightsSerialController(req, res, next) {
  try {
    const result = await writeNavigationLightsSerialData(req.body.data);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
