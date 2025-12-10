// server.js (mise à jour complète)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const smsRoutes = require('./routes/sms.routes');
const weatherRoutes = require('./routes/weather.routes');
const monitoringService = require('./services/monitoring.service');
const weatherService = require('./services/weather.service');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Schemas
const SensorData = require('./models/SensorData');

// Routes
app.use('/api/sms', smsRoutes);
app.use('/api/weather', weatherRoutes);

// Enhanced collect endpoint with weather integration
app.post('/api/collect', async (req, res) => {
  try {
    const data = new SensorData(req.body);
    await data.save();
    
    // Get weather data
    const weather = await weatherService.getCurrentWeather();
    const forecast = await weatherService.getForecast();
    
    // Check for alerts (sensor + weather)
    const sensorAlerts = await monitoringService.checkAndAlert(req.body);
    const weatherRecs = await weatherService.getAgriculturalRecommendations(
      req.body,
      weather,
      forecast
    );
    
    res.json({ 
      success: true, 
      data,
      sensor_alerts: sensorAlerts.length,
      weather_recommendations: weatherRecs.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get combined dashboard data
app.get('/api/dashboard/:sensor_id', async (req, res) => {
  try {
    const { sensor_id } = req.params;
    
    // Get sensor data
    const sensorData = await SensorData.find({ sensor_id })
      .sort({ timestamp: -1 })
      .limit(20);
    
    // Get weather
    const weather = await weatherService.getCurrentWeather();
    const forecast = await weatherService.getForecast();
    
    // Get recommendations
    const recommendations = await weatherService.getAgriculturalRecommendations(
      sensorData[0],
      weather,
      forecast
    );
    
    res.json({
      success: true,
      sensor_data: sensorData,
      weather: weather,
      forecast: forecast,
      recommendations: recommendations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`✓ API Gateway running on port ${PORT}`);
      console.log('✓ SMS Service enabled');
      console.log('✓ Weather Service enabled');
    });
  });