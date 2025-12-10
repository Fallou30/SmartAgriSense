// api/routes/weather.routes.js
const express = require('express');
const router = express.Router();
const weatherService = require('../services/weather.service');

router.get('/current', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    const weather = await weatherService.getCurrentWeather(
      lat ? parseFloat(lat) : undefined,
      lon ? parseFloat(lon) : undefined
    );
    res.json({ success: true, data: weather });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/forecast', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    const forecast = await weatherService.getForecast(
      lat ? parseFloat(lat) : undefined,
      lon ? parseFloat(lon) : undefined
    );
    res.json({ success: true, data: forecast });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;