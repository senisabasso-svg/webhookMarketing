function parseWebhookBody(req, res, next) {
  if (!Buffer.isBuffer(req.body)) return next();

  try {
    req.rawBody = req.body;
    req.body = JSON.parse(req.body.toString("utf8"));
    next();
  } catch {
    res.sendStatus(400);
  }
}

module.exports = { parseWebhookBody };
