function badRequest(res, details) {
  return res.status(400).json({ error: "Invalid ADM control command", details });
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/** Validate the JSON command format used by the navigation/ADM controller. */
export function validateAdmControl(control) {
  return (req, res, next) => {
    const { control: requestedControl, cmd } = req.body ?? {};
    if (requestedControl !== control) {
      return badRequest(res, `control must be "${control}"`);
    }
    if (!cmd || typeof cmd !== "object" || Array.isArray(cmd)) {
      return badRequest(res, "cmd must be an object");
    }
    if (![0, 1].includes(cmd.status)) {
      return badRequest(res, "cmd.status must be 0 or 1");
    }
    if (!isNonNegativeInteger(cmd.time)) {
      return badRequest(res, "cmd.time must be a non-negative integer");
    }

    if (control === "buzzer" && cmd.mode === "custom") {
      if (![cmd.freq, cmd.timeOn, cmd.timeOff].every(isNonNegativeInteger)) {
        return badRequest(res, "custom buzzer requires integer freq, timeOn, and timeOff");
      }
    }
    return next();
  };
}
