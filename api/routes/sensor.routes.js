// api/routes/sensor.routes.js
const express = require('express');
const router = express.Router();
const SensorData = require('../models/SensorData');
const monitoringService = require('../services/monitoring.service');

// Collecter données capteur
router.post('/collect', async (req, res) => {
  try {
    const { sensor_id, humidity, temperature, soil_ph, location } = req.body;

    // Validation
    if (!sensor_id || humidity === undefined || temperature === undefined || soil_ph === undefined) {
      return res.status(400).json({
        error: 'Données manquantes: sensor_id, humidity, temperature, soil_ph requis'
      });
    }

    // Sauvegarder
    const data = new SensorData({
      sensor_id,
      humidity,
      temperature,
      soil_ph,
      location
    });
    await data.save();

    // Vérifier alertes
    const alerts = await monitoringService.checkAndAlert(data);

    res.json({
      success: true,
      data,
      alerts_triggered: alerts.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer dernières données
router.get('/data/:sensor_id', async (req, res) => {
  try {
    const { sensor_id } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const data = await SensorData.find({ sensor_id })
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stats capteur
router.get('/stats/:sensor_id', async (req, res) => {
  try {
    const { sensor_id } = req.params;
    
    const stats = await SensorData.aggregate([
      { $match: { sensor_id } },
      { $sort: { timestamp: -1 } },
      { $limit: 100 },
      {
        $group: {
          _id: sensor_id,
          avg_humidity: { $avg: '$humidity' },
          avg_temperature: { $avg: '$temperature' },
          avg_ph: { $avg: '$soil_ph' },
          min_humidity: { $min: '$humidity' },
          max_temperature: { $max: '$temperature' }
        }
      }
    ]);

    res.json({ success: true, stats: stats[0] || {} });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Liste tous les capteurs
router.get('/list', async (req, res) => {
  try {
    const sensors = await SensorData.distinct('sensor_id');
    
    const sensorsData = await Promise.all(
      sensors.map(async (sensor_id) => {
        const latest = await SensorData.findOne({ sensor_id })
          .sort({ timestamp: -1 });
        
        const activeAlerts = await monitoringService.getActiveAlerts(sensor_id);
        
        return {
          sensor_id,
          latest_data: latest,
          active_alerts: activeAlerts.length,
          status: this.getSensorStatus(latest)
        };
      })
    );

    res.json({ success: true, sensors: sensorsData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getSensorStatus(data) {
  if (!data) return 'offline';
  
  const timeDiff = Date.now() - new Date(data.timestamp).getTime();
  if (timeDiff > 5 * 60 * 1000) return 'offline'; // 5 min
  
  if (data.humidity < 30 || data.temperature > 38) return 'critical';
  if (data.humidity < 40 || data.temperature > 35) return 'warning';
  
  return 'online';
}

module.exports = router;