import {
  sy600AckE0,
  sy600ChannelDispense,
  sy600ConveyorControl,
  sy600GetInfraredStatus,
  sy600GetMicroswitchStatus,
  sy600LiftControl,
  sy600MicroStepDispense,
  sy600OutputDoorControl,
  sy600PickupDoorControl,
  sy600ResetScan,
} from "../services/sy600.service.js";

function parseBody(req) {
  return req.body || {};
}

export async function sy600LiftController(req, res, next) {
  try {
    return res.json(await sy600LiftControl(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

export async function sy600MicroStepController(req, res, next) {
  try {
    return res.json(await sy600MicroStepDispense(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

export async function sy600OutputDoorController(req, res, next) {
  try {
    return res.json(await sy600OutputDoorControl(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

export async function sy600ConveyorController(req, res, next) {
  try {
    return res.json(await sy600ConveyorControl(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

export async function sy600PickupDoorController(req, res, next) {
  try {
    return res.json(await sy600PickupDoorControl(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

export async function sy600ResetScanController(req, res, next) {
  try {
    return res.json(await sy600ResetScan(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

export async function sy600InfraredController(req, res, next) {
  try {
    return res.json(await sy600GetInfraredStatus(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

export async function sy600MicroswitchController(_req, res, next) {
  try {
    return res.json(await sy600GetMicroswitchStatus());
  } catch (error) {
    return next(error);
  }
}

export async function sy600ChannelDispenseController(req, res, next) {
  try {
    return res.json(await sy600ChannelDispense(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

export async function sy600AckE0Controller(req, res, next) {
  try {
    return res.json(await sy600AckE0(parseBody(req)));
  } catch (error) {
    return next(error);
  }
}

