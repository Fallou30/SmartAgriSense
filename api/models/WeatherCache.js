// models/WeatherCache.js
const mongoose = require('mongoose');

const weatherCacheSchema = new mongoose.Schema({
  location: {
    lat: Number,
    lon: Number
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  type: {
    type: String,
    enum: ['current', 'forecast'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 1800 // Auto-delete after 30 minutes
  }
});

weatherCacheSchema.index({ location: 1, type: 1 });

module.exports = mongoose.model('WeatherCache', weatherCacheSchema);