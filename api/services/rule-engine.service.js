// api/services/rule-engine.service.js
class RuleEngine {
  constructor() {
    this.rules = {
      humidity: {
        critical_low: 30,
        warning_low: 40,
        warning_high: 75,
        critical_high: 85
      },
      temperature: {
        critical_low: 10,
        warning_low: 15,
        warning_high: 35,
        critical_high: 38
      },
      soil_ph: {
        critical_low: 5.0,
        warning_low: 5.5,
        warning_high: 7.5,
        critical_high: 8.0
      },
      battery: {
        warning: 30,
        critical: 15
      }
    };

    this.recommendations = {
      humidity_critical_low: {
        message: "Irrigation urgente requise",
        action: "START_IMMEDIATE_IRRIGATION",
        priority: "CRITICAL"
      },
      humidity_warning_low: {
        message: "Irrigation recommandée",
        action: "SCHEDULE_IRRIGATION",
        priority: "WARNING"
      },
      temperature_critical_high: {
        message: "Stress thermique - Activer ombrage",
        action: "ACTIVATE_SHADING",
        priority: "CRITICAL"
      },
      soil_ph_critical_low: {
        message: "Sol trop acide - Ajouter chaux",
        action: "APPLY_LIME",
        priority: "WARNING"
      }
    };
  }

  evaluate(sensorData) {
    const evaluations = [];
    
    // Évaluer humidité
    if (sensorData.humidity < this.rules.humidity.critical_low) {
      evaluations.push({
        ...this.recommendations.humidity_critical_low,
        metric: 'humidity',
        value: sensorData.humidity,
        threshold: this.rules.humidity.critical_low
      });
    } else if (sensorData.humidity < this.rules.humidity.warning_low) {
      evaluations.push({
        ...this.recommendations.humidity_warning_low,
        metric: 'humidity',
        value: sensorData.humidity,
        threshold: this.rules.humidity.warning_low
      });
    }
    
    // Évaluer température
    if (sensorData.temperature > this.rules.temperature.critical_high) {
      evaluations.push({
        ...this.recommendations.temperature_critical_high,
        metric: 'temperature',
        value: sensorData.temperature,
        threshold: this.rules.temperature.critical_high
      });
    }
    
    // Évaluer pH
    if (sensorData.soil_ph < this.rules.soil_ph.critical_low) {
      evaluations.push({
        ...this.recommendations.soil_ph_critical_low,
        metric: 'soil_ph',
        value: sensorData.soil_ph,
        threshold: this.rules.soil_ph.critical_low
      });
    }
    
    // Évaluer batterie
    if (sensorData.battery_level < this.rules.battery.critical) {
      evaluations.push({
        message: "Batterie critique - Recharger capteur",
        action: "REPLACE_BATTERY",
        priority: "CRITICAL",
        metric: 'battery',
        value: sensorData.battery_level,
        threshold: this.rules.battery.critical
      });
    }
    
    return evaluations;
  }

  generateSMSMessage(evaluation) {
    const templates = {
      CRITICAL: `🚨 ALERTE CRITIQUE: ${evaluation.message} (Valeur: ${evaluation.value})`,
      WARNING: `⚠️ ALERTE: ${evaluation.message} (Valeur: ${evaluation.value})`
    };
    
    return templates[evaluation.priority] || evaluation.message;
  }
}

export default new RuleEngine();