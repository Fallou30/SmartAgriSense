// api/models/SensorData.js
const mongoose = require('mongoose');

const sensorDataSchema = new mongoose.Schema({
  sensor_id: {
    type: String,
    required: true,
    index: true
  },
  humidity: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  temperature: {
    type: Number,
    required: true
  },
  soil_ph: {
    type: Number,
    required: true,
    min: 0,
    max: 14
  },
  location: {
    lat: Number,
    lon: Number
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index composé pour requêtes optimisées
sensorDataSchema.index({ sensor_id: 1, timestamp: -1 });

module.exports = mongoose.model('SensorData', sensorDataSchema);