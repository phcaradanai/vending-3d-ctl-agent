import { getSerialConfig, writeNavigationLightsSerialData } from "../services/serial.service.js";

/** Send ADM JSON commands through the same navigation-lights TTY as LED. */
export async function writeAdmControlController(req, res, next) {
  try {
    const path = getSerialConfig().navigationLights.path;
    console.log(`[serial:${path}] writeAdmControlController req.body ->`, JSON.stringify(req.body));
    const serialResponse = await writeNavigationLightsSerialData(req.body);
    return res.json({
      success: true,
      accepted: req.body,
      serialResponse,
    });
  } catch (error) {
    return next(error);
  }
}
