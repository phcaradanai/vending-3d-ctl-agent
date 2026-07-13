export async function validateSerialWrite(req, res, next) {
  const { data } = req.body;

  if (typeof data !== "string" || !data.trim().length) {
    return res.status(400).json({
      error: "Body must include non-empty string field: data",
    });
  }

  // Remove whitespace to support space-separated hex payloads
  const normalizedHex = data.replace(/\s+/g, "");

  if (normalizedHex.length % 2 !== 0) {
    return res.status(400).json({
      error: "Serial payload must be a valid even-length hex string",
    });
  }

  if (!/^[0-9a-fA-F]+$/.test(normalizedHex)) {
    return res.status(400).json({
      error: "Serial payload must be a valid even-length hex string",
    });
  }

  return next();
}



export async function validateSerialWriteNavigationLights(req, res, next) {
  const { data } = req.body;

  // Check that data is a plain object and not an array or null
  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    return res.status(400).json({
      error: 'Body must include a JSON object field: data, e.g. {"data": {"act":"led","cmd":[1,165,0,0,255,1]}}',
    });
  }

  return next();
}
