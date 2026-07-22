import { Router } from "express";
import { SERIAL_QR_NFC, SERIAL_QR_NFC_BAUD_RATE } from "../config/env.js";
import { subscribeQrNfcEvents } from "../services/qr-nfc.events.js";

const qrNfcRouter = Router();

/**
 * Stream physical QR/NFC reader frames from this vending agent.
 * The route is mounted behind the normal API bearer middleware. Core proxies
 * it to the kiosk browser and chooses the upstream using the kiosk code.
 */
qrNfcRouter.get("/qr-nfc/events", (req, res) => {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const send = (event, data) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = subscribeQrNfcEvents((event) => send("scan", event));
  send("ready", {
    channel: "qr-nfc",
    path: SERIAL_QR_NFC,
    baudRate: SERIAL_QR_NFC_BAUD_RATE,
  });
  const keepAlive = setInterval(() => {
    if (res.writableEnded || res.destroyed) return;
    res.write(": keepalive\n\n");
  }, 15_000);

  const cleanup = () => {
    clearInterval(keepAlive);
    unsubscribe();
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
});

export default qrNfcRouter;
