// api/services/monitoring.service.js
const smsService = require('./sms.service');
const Alert = require('../models/Alert');

class MonitoringService {
  constructor() {
    this.thresholds = {
      humidity_critical: 30,
      humidity_low: 40,
      temperature_high: 38,
      temperature_critical: 40,
      ph_low: 5.5,
      ph_high: 7.5
    };

    this.farmerPhones = process.env.FARMER_PHONES?.split(',') || [
      '+221771234567'
    ];

    // Éviter spam - pas plus d'une alerte toutes les 30 min par capteur
    this.alertCooldown = new Map();
    this.cooldownDuration = 30 * 60 * 1000;
  }

  async checkAndAlert(sensorData) {
    const alerts = [];
    const cooldownKey = `${sensorData.sensor_id}_${Date.now()}`;

    // Check si cooldown actif
    const lastAlert = this.alertCooldown.get(sensorData.sensor_id);
    if (lastAlert && Date.now() - lastAlert < this.cooldownDuration) {
      return alerts; // Pas d'alerte pendant cooldown
    }

    // Vérifications critiques
    if (sensorData.humidity < this.thresholds.humidity_critical) {
      alerts.push(await this.createAlert({
        sensor_id: sensorData.sensor_id,
        type: 'humidity',
        severity: 'critical',
        message: `Humidité critique: ${sensorData.humidity}%`,
        data: sensorData
      }));
    }

    if (sensorData.temperature > this.thresholds.temperature_critical) {
      alerts.push(await this.createAlert({
        sensor_id: sensorData.sensor_id,
        type: 'temperature',
        severity: 'critical',
        message: `Température critique: ${sensorData.temperature}°C`,
        data: sensorData
      }));
    }

    if (sensorData.soil_ph < this.thresholds.ph_low || 
        sensorData.soil_ph > this.thresholds.ph_high) {
      alerts.push(await this.createAlert({
        sensor_id: sensorData.sensor_id,
        type: 'ph',
        severity: 'warning',
        message: `pH anormal: ${sensorData.soil_ph}`,
        data: sensorData
      }));
    }

    // Envoyer SMS si alerte critique
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      await this.sendBulkSMS(criticalAlerts[0]);
      this.alertCooldown.set(sensorData.sensor_id, Date.now());
    }

    return alerts;
  }

  async createAlert(alertData) {
    const alert = new Alert({
      sensor_id: alertData.sensor_id,
      type: alertData.type,
      severity: alertData.severity,
      message: alertData.message
    });

    await alert.save();
    return alert;
  }

  async sendBulkSMS(alert) {
    const message = smsService.formatAlertMessage(
      `${alert.type}_${alert.severity}`,
      { ...alert.toObject() }
    );

    const result = await smsService.sendBulkAlerts(
      this.farmerPhones,
      message
    );

    // Mettre à jour statut
    alert.sms_status = result.sent > 0 ? 'sent' : 'failed';
    await alert.save();

    console.log(`📱 SMS bulk: ${result.sent}/${result.total} envoyés`);
  }

  async getActiveAlerts(sensor_id) {
    return Alert.find({
      sensor_id,
      resolved: false
    }).sort({ timestamp: -1 });
  }

  async resolveAlert(alertId) {
    return Alert.findByIdAndUpdate(alertId, {
      resolved: true,
      resolved_at: new Date()
    });
  }
}

module.exports = new MonitoringService();