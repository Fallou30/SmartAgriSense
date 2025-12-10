// api/models/Alert.js
const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  sensor_id: String,
  type: {
    type: String,
    enum: ['humidity', 'temperature', 'ph', 'weather', 'manual'],
    required: true
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  message: {
    type: String,
    required: true
  },
  phone: String,
  sms_status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  twilio_sid: String,
  resolved: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

alertSchema.index({ timestamp: -1 });
alertSchema.index({ resolved: 1, severity: 1 });

module.exports = mongoose.model('Alert', alertSchema);