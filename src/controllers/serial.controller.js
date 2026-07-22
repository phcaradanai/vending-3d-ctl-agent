import {
  getSerialConfig,
  getSerialHealthSnapshot,
  getSerialWriteQueueSnapshot,
  writeNavigationLightsSerialData,
  writeNavigationLightsSerialDataNoWait,
  writeVendingSerialData,
} from "../services/serial.service.js";
import { getMqttStatus } from "../services/mqtt.service.js";
import { getNatsStatus } from "../services/nats.service.js";
import {
  SERIAL_API_TIMEOUT_MS,
  SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS,
  SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY,
  SERIAL_PORT_QUEUE_LOG,
  SERIAL_WRITE_TIMEOUT_MS,
  SY600_DEVICE_ADDRESS_HEX,
  SY600_USE_CRC16,
} from "../config/env.js";
import { getSoftwareIdentification } from "../config/softwareIdentification.js";

export async function healthController(_req, res) {
  const softwareIdentification = getSoftwareIdentification();
  const serialConfig = getSerialConfig();
  const serialHealth = getSerialHealthSnapshot();
  const mqtt = getMqttStatus();
  const nats = getNatsStatus();
  const now = new Date().toISOString();

  const serialPorts = serialHealth.ports;
  const disconnectedPorts = Object.values(serialPorts).filter((port) => !port.serialReady);
  const alerts = [
    ...disconnectedPorts.map((port) => ({
      level: "warning",
      source: `serial:${port.channel}`,
      message: port.lastError || "Port is not connected",
    })),
  ];

  if (mqtt.enabled && !mqtt.isConnected) {
    alerts.push({
      level: "warning",
      source: "mqtt",
      message: mqtt.lastError || "MQTT is enabled but not connected",
    });
  }

  if (nats.enabled && !nats.isConnected) {
    alerts.push({
      level: "warning",
      source: "nats",
      message: nats.lastError || "NATS is enabled but not connected",
    });
  }

  res.json({
    status:
      serialHealth.serialReady && (!mqtt.enabled || mqtt.isConnected) && (!nats.enabled || nats.isConnected)
        ? "ok"
        : "degraded",
    timestamp: now,
    softwareIdentification,
    summary: {
      systemStatus:
          serialHealth.serialReady && (!mqtt.enabled || mqtt.isConnected) && (!nats.enabled || nats.isConnected)
          ? "ok"
          : "degraded",
      alertsCount: alerts.length,
      serial: {
        ready: serialHealth.serialReady,
        connectedPorts: serialHealth.summary.connectedPorts,
        totalPorts: serialHealth.summary.totalPorts,
      },
      mqtt: {
        enabled: mqtt.enabled,
        connected: mqtt.isConnected,
      },
      nats: {
        enabled: nats.enabled,
        connected: nats.isConnected,
        kioskCode: nats.kioskCode,
        scannerSubject: nats.scannerSubject,
        scannerStream: nats.scannerStream,
      },
      sy600: {
        deviceAddressHex: SY600_DEVICE_ADDRESS_HEX,
        useCrc16: SY600_USE_CRC16,
      },
    },
    nats,
    devices: {
      serial: {
        summary: {
          serialReady: serialHealth.serialReady,
          connectedPorts: serialHealth.summary.connectedPorts,
          totalPorts: serialHealth.summary.totalPorts,
        },
        channels: {
          vending: {
            ...serialConfig.vending,
            ...serialPorts.vending,
          },
          navigationLights: {
            ...serialConfig.navigationLights,
            ...serialPorts.navigationLights,
          },
          qrNfc: {
            ...serialConfig.qrNfc,
            ...serialPorts.qrNfc,
          },
          // serialPorts.compressor exists only when SERIAL_COMPRESSOR is a separate COM;
          // config alone still shows path/baud + sharedWithVending for the fallback case.
          compressor: {
            ...serialConfig.compressor,
            ...(serialPorts.compressor || {}),
          },
        },
        writeQueues: getSerialWriteQueueSnapshot(serialPorts),
      },
      mqtt: {
        ...mqtt,
        topicRouting: {
          qrnfcTopic: mqtt.topic,
        },
      },
      sy600: {
        transport: {
          portPath: serialConfig.vending.path,
          baudRate: serialConfig.vending.baudRate,
        },
        protocol: {
          startTx: "0xEE",
          startRx: "0xFF",
          version: "0x01",
          deviceAddressHex: SY600_DEVICE_ADDRESS_HEX,
          useCrc16: SY600_USE_CRC16,
        },
      },
    },
    diagnostics: {
      process: {
        uptimeSeconds: Number(process.uptime().toFixed(0)),
        nodeVersion: process.version,
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
      },
      serialPolicy: {
        writeTimeoutMs: SERIAL_WRITE_TIMEOUT_MS,
        apiTimeoutMs: SERIAL_API_TIMEOUT_MS,
        navigationLightsRetry: {
          maxRetry: SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY,
          retryDelayMs: SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS,
        },
        portQueueConsoleLog: SERIAL_PORT_QUEUE_LOG,
      },
      appTime: {
        now,
        timezone: process.env.TZ || "unknown",
      },
    },
    alerts,
  });
}

export async function writeVendingSerialController(req, res, next) {
  try {
    const result = await writeVendingSerialData(req.body.data);

    const vendingPath = getSerialConfig().vending.path;
    console.log(
      `[serial:${vendingPath}] writeVendingSerialController result ->`,
      JSON.stringify(result)
    );
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function writeNavigationLightsSerialController(req, res, next) {
  try {
    const navigationLightsPath = getSerialConfig().navigationLights.path;
    console.log(
      `[serial:${navigationLightsPath}] writeNavigationLightsSerialController req.body.data ->`,
      JSON.stringify(req.body.data)
    );
    const result = await writeNavigationLightsSerialData(req.body.data);

    // console.log(
    //   `[serial:${navigationLightsPath}] writeNavigationLightsSerialController result ->`,
    //   JSON.stringify(result)
    // );

    return res.json({
      success: true,
      accepted: req.body.data,
      serialResponse: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function writeNavigationLightsSerialNoWaitController(req, res, next) {
  try {
    const navigationLightsPath = getSerialConfig().navigationLights.path;
    console.log(
      `[serial:${navigationLightsPath}] writeNavigationLightsSerialNoWaitController req.body.data ->`,
      JSON.stringify(req.body.data)
    );
    const result = await writeNavigationLightsSerialDataNoWait(req.body.data);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
