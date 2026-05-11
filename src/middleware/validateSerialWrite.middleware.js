export function validateSerialWrite(req, res, next) {
  const { data } = req.body;

  if (typeof data !== "string" || !data.length) {
    return res.status(400).json({
      error: "Body must include non-empty string field: data",
    });
  }

  return next();
}



export function validateSerialWriteNavigationLights(req, res, next) {
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
