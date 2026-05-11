export async function validateDispenserCmd(req, res, next) {
    const { prescription } = req.body;
  
    if (typeof prescription !== "string" || !prescription.length) {
      return res.status(400).json({
        error: "Body must include non-empty string field: prescription",
      });
    }
  
    return next();
  }
  