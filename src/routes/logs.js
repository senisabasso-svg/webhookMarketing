const express = require("express");
const { requireApiKey } = require("../middleware/apiKey");
const { fetchLogs } = require("../services/logsQuery");

const router = express.Router();

router.get("/", requireApiKey, async (req, res, next) => {
  try {
    const result = await fetchLogs(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
