// api/services/sms.service.js
const twilio = require('twilio');

class SMSService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.from = process.env.TWILIO_PHONE_NUMBER;
    this.testMode = process.env.NODE_ENV === 'development';
  }

  async sendAlert(to, message, alertId) {
    if (this.testMode) {
      console.log('📱 SMS TEST MODE');
      console.log(`→ ${to}`);
      console.log(`📝 ${message}`);
      return { success: true, sid: `test_${Date.now()}`, test: true };
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.from,
        to: to
      });

      console.log(`✓ SMS envoyé: ${result.sid}`);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('SMS Error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendBulkAlerts(recipients, message) {
    const results = await Promise.all(
      recipients.map(phone => this.sendAlert(phone, message))
    );
    
    return {
      total: results.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
  }

  formatAlertMessage(type, data) {
    const templates = {
      humidity_critical: `🚨 ALERTE CRITIQUE
Capteur ${data.sensor_id}
Humidité: ${data.humidity}%
→ Irrigation urgente requise`,
      
      temperature_high: `🌡️ ALERTE TEMPÉRATURE
Capteur ${data.sensor_id}
Température: ${data.temperature}°C
→ Stress thermique détecté`,
      
      ph_abnormal: `⚗️ ALERTE pH
Capteur ${data.sensor_id}
pH: ${data.soil_ph}
→ ${data.soil_ph < 5.5 ? 'Sol trop acide' : 'Sol trop basique'}`,
      
      weather_alert: `🌦️ ALERTE MÉTÉO
${data.message}
→ Consulter dashboard`
    };

    return templates[type] || data.message;
  }
}

module.exports = new SMSService();