import { Router } from "express";
import {
  sy600AckE0Controller,
  sy600ChannelDispenseController,
  sy600ConveyorController,
  sy600InfraredController,
  sy600LiftController,
  sy600MicroswitchController,
  sy600MicroStepController,
  sy600OutputDoorController,
  sy600PickupDoorController,
  sy600ResetScanController,
} from "../controllers/sy600.controller.js";

const sy600Router = Router();

// POST /sy600/c3/lift
// Purpose: Control elevator/lift position.
// Body example:
// {
//   "target": 1
// }
// target:
// - 0 => reset to origin
// - 1..7 => move to floor 1..7
// - 0x55..0x57 => move to output position 1..3
sy600Router.post("/sy600/c3/lift", sy600LiftController); // Work^^
// POST /sy600/c4/micro-step
// Purpose: Trigger micro-step dispensing at layer/channel range.
// Body example:
// {
//   "layer": 1,
//   "channelStart": 0,
//   "channelEnd": 5,
//   "repeat": 3
// }
// repeat is optional (default 1, allowed 1..100).
sy600Router.post("/sy600/c4/micro-step", sy600MicroStepController); // Work^^
// POST /sy600/c5/output-door
// Purpose: Open/close output door.
// Body example:
// {
//   "action": 1,
//   "doorNo": 1
// }
// action: 0=close, 1=open
sy600Router.post("/sy600/c5/output-door", sy600OutputDoorController); // Work^^
// POST /sy600/c6/conveyor
// Purpose: Run platform conveyor.
// Body example:
// {
//   "direction": 0,
//   "seconds": 3
// }
// direction: 0=forward, 1=reverse
// seconds: 0 means device default duration.
sy600Router.post("/sy600/c6/conveyor", sy600ConveyorController);// Work^^
// POST /sy600/c7/pickup-door
// Purpose: Open/close pickup door.
// Body example:
// {
//   "action": 1,
//   "doorNo": 1
// }
// action: 0=close, 1=open
sy600Router.post("/sy600/c7/pickup-door", sy600PickupDoorController);// Work^^
// POST /sy600/24/reset-scan
// Purpose: Reset door/lift and scan machine structure.
// Body example:
// {
//   "resetDoor": 1,
//   "resetLift": 1
// }
// value: 1=reset, 0=skip
sy600Router.post("/sy600/24/reset-scan", sy600ResetScanController);// Work^^
// POST /sy600/35/infrared
// Purpose: Read infrared/hall state by sensor type.
// Body example:
// {
//   "sensorType": 0
// }
// sensorType:
// - 0=drop sensor
// - 1=platform1 infrared
// - 2=anti-pinch1 infrared
// - 3=reserved
// - 4=platform2 infrared
// - 5=anti-pinch2 infrared
// - 6=platform3 infrared
// - 7=anti-pinch3 infrared
sy600Router.post("/sy600/35/infrared", sy600InfraredController);// Work^^
// GET /sy600/39/microswitch
// Purpose: Read microswitch status map.
// No request body required.
sy600Router.get("/sy600/39/microswitch", sy600MicroswitchController); //ISSUE --*
// Backward compatibility for older clients (deprecated).
sy600Router.post("/sy600/39/microswitch", sy600MicroswitchController);  //ISSUE --*
// POST /sy600/28/dispense
// Purpose: Dispense by channel range and order id.
// Body example:
// {
//   "layerAddressHex": "AABBCCDD",
//   "channelStart": 0,
//   "channelEnd": 0,
//   "orderIdHex": "0011223344556677"
// }
// orderIdHex must be 16 hex chars (8 bytes).
sy600Router.post("/sy600/28/dispense", sy600ChannelDispenseController);
// POST /sy600/e0/ack
// Purpose: ACK active error report (E0) to stop repeated report.
// Body example:
// {
//   "addressHex": "AABBCCDD"
// }
// addressHex is optional; defaults to SY600_DEVICE_ADDRESS_HEX.
sy600Router.post("/sy600/e0/ack", sy600AckE0Controller);

export default sy600Router;

