/**
 * In-process fan-out for QR/NFC frames received from the serial reader.
 *
 * MQTT remains the integration path for external consumers. The SSE path is
 * intentionally local to this vending agent so MediSync can subscribe to the
 * physical reader belonging to one cabinet without broadcasting a scan to
 * every kiosk.
 */

const subscribers = new Set();

export function subscribeQrNfcEvents(listener) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function publishQrNfcEvent(event) {
  for (const listener of subscribers) {
    try {
      listener(event);
    } catch (error) {
      // A disconnected/buggy SSE consumer must never interrupt serial RX.
      console.error(`[qr-nfc-events] subscriber failed: ${error.message}`);
    }
  }
}

export function getQrNfcSubscriberCount() {
  return subscribers.size;
}
