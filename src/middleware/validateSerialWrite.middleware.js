export function validateSerialWrite(req, res, next) {
  const { data } = req.body;

  if (typeof data !== "string" || !data.length) {
    return res.status(400).json({
      error: "Body must include non-empty string field: data",
    });
  }

  return next();
}
