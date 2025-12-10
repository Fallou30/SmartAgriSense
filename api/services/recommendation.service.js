const SensorData = require('../models/SensorData');
const FarmerProfile = require('../models/FarmerProfile');
const weatherService = require('./weather.service');

class RecommendationService {
  constructor() {
    // Base de connaissances agronomiques
    this.cropKnowledge = {
      // Riz
      rice: {
        optimalHumidity: { min: 60, max: 80 },
        optimalTemperature: { min: 25, max: 35 },
        optimalPH: { min: 5.5, max: 6.5 },
        waterRequirement: 1200, // mm par saison
        growthStages: {
          germination: { duration: 7, water: 30 },
          vegetative: { duration: 30, water: 40 },
          reproductive: { duration: 35, water: 50 },
          ripening: { duration: 30, water: 20 }
        }
      },
      // Maïs
      maize: {
        optimalHumidity: { min: 40, max: 60 },
        optimalTemperature: { min: 20, max: 30 },
        optimalPH: { min: 5.8, max: 7.0 },
        waterRequirement: 500,
        growthStages: {
          emergence: { duration: 10, water: 20 },
          vegetative: { duration: 40, water: 60 },
          flowering: { duration: 20, water: 70 },
          grain_fill: { duration: 30, water: 50 }
        }
      },
      // Tomates
      tomatoes: {
        optimalHumidity: { min: 50, max: 70 },
        optimalTemperature: { min: 18, max: 28 },
        optimalPH: { min: 6.0, max: 6.8 },
        waterRequirement: 400,
        growthStages: {
          seedling: { duration: 20, water: 30 },
          flowering: { duration: 30, water: 50 },
          fruiting: { duration: 40, water: 60 }
        }
      }
    };
  }

  // Analyser les données d'un capteur
  async analyzeSensorData(sensorId, userId = null) {
    try {
      // Récupérer les dernières données
      const sensorData = await SensorData.find({ sensor_id: sensorId })
        .sort({ timestamp: -1 })
        .limit(24); // 24 dernières heures

      if (sensorData.length === 0) {
        return { recommendations: [], summary: 'Aucune donnée disponible' };
      }

      const latest = sensorData[0];
      
      // Récupérer les prévisions météo
      const weather = await weatherService.getCurrentWeather();
      const forecast = await weatherService.getForecast();

      // Récupérer le profil de l'agriculteur si userId fourni
      let farmerProfile = null;
      let cropType = 'maïs'; // Par défaut
      
      if (userId) {
        farmerProfile = await FarmerProfile.findOne({ userId });
        if (farmerProfile?.mainCrops?.length > 0) {
          cropType = farmerProfile.mainCrops[0].type || 'maïs';
        }
      }

      // Générer les recommandations
      const recommendations = await this.generateRecommendations(
        latest,
        sensorData,
        weather,
        forecast,
        cropType,
        farmerProfile
      );

      // Calculer le score de santé
      const healthScore = this.calculateHealthScore(latest, cropType);

      return {
        recommendations,
        summary: {
          healthScore,
          currentStatus: this.getStatusDescription(healthScore),
          sensorId,
          timestamp: latest.timestamp,
          cropType
        }
      };
    } catch (error) {
      console.error('Erreur analyse:', error);
      throw error;
    }
  }

  // Générer les recommandations
  async generateRecommendations(latestData, historicalData, weather, forecast, cropType, farmerProfile) {
    const recommendations = [];
    const cropKnowledge = this.cropKnowledge[cropType] || this.cropKnowledge.maize;

    // 1. Analyse de l'humidité
    const humidityAnalysis = this.analyzeHumidity(
      latestData.humidity,
      cropKnowledge.optimalHumidity,
      forecast
    );
    recommendations.push(...humidityAnalysis);

    // 2. Analyse de la température
    const tempAnalysis = this.analyzeTemperature(
      latestData.temperature,
      cropKnowledge.optimalTemperature,
      weather
    );
    recommendations.push(...tempAnalysis);

    // 3. Analyse du pH
    const phAnalysis = this.analyzePH(
      latestData.soil_ph,
      cropKnowledge.optimalPH
    );
    recommendations.push(...phAnalysis);

    // 4. Recommandations météo
    const weatherAnalysis = this.analyzeWeather(weather, forecast, farmerProfile);
    recommendations.push(...weatherAnalysis);

    // 5. Tendances historiques
    const trendAnalysis = this.analyzeTrends(historicalData);
    recommendations.push(...trendAnalysis);

    // 6. Recommandations spécifiques culture
    const cropSpecific = this.getCropSpecificRecommendations(cropType, latestData);
    recommendations.push(...cropSpecific);

    // 7. Planification irrigation (si données suffisantes)
    if (historicalData.length >= 12) {
      const irrigationPlan = this.generateIrrigationPlan(
        historicalData,
        forecast,
        cropKnowledge
      );
      if (irrigationPlan) {
        recommendations.push(irrigationPlan);
      }
    }

    // Trier par priorité
    return this.prioritizeRecommendations(recommendations);
  }

  // Analyse humidité
  analyzeHumidity(currentHumidity, optimalRange, forecast) {
    const recommendations = [];
    const nextDayRain = forecast[1]?.rain_chance || 0;

    if (currentHumidity < optimalRange.min * 0.7) {
      // Très sec
      recommendations.push({
        type: 'critical',
        category: 'irrigation',
        title: 'Sécheresse critique',
        message: `Humidité extrêmement basse (${currentHumidity}%). Sol très sec.`,
        action: 'Irrigation intensive immédiate',
        priority: 10,
        data: { humidity: currentHumidity, threshold: optimalRange.min }
      });
    } else if (currentHumidity < optimalRange.min) {
      // Sec
      if (nextDayRain > 50) {
        recommendations.push({
          type: 'info',
          category: 'irrigation',
          title: 'Attendre la pluie',
          message: `Humidité basse (${currentHumidity}%) mais pluie prévue demain (${nextDayRain}%).`,
          action: 'Reporter irrigation de 24h',
          priority: 3,
          data: { humidity: currentHumidity, rainChance: nextDayRain }
        });
      } else {
        recommendations.push({
          type: 'warning',
          category: 'irrigation',
          title: 'Irrigation nécessaire',
          message: `Humidité basse (${currentHumidity}%).`,
          action: 'Programmer irrigation modérée',
          priority: 7,
          data: { humidity: currentHumidity, optimalMin: optimalRange.min }
        });
      }
    } else if (currentHumidity > optimalRange.max * 1.3) {
      // Très humide
      recommendations.push({
        type: 'critical',
        category: 'drainage',
        title: 'Excès d\'eau',
        message: `Humidité excessive (${currentHumidity}%). Risque de pourriture racinaire.`,
        action: 'Améliorer drainage immédiatement',
        priority: 9,
        data: { humidity: currentHumidity, threshold: optimalRange.max }
      });
    }

    return recommendations;
  }

  // Analyse température
  analyzeTemperature(currentTemp, optimalRange, weather) {
    const recommendations = [];
    const windSpeed = weather?.wind_speed || 0;

    if (currentTemp > optimalRange.max * 1.2) {
      // Très chaud
      recommendations.push({
        type: 'critical',
        category: 'temperature',
        title: 'Stress thermique sévère',
        message: `Température critique (${currentTemp}°C). Cultures en danger.`,
        action: windSpeed > 5 
          ? 'Irrigation rafraîchissante + vent naturel' 
          : 'Irrigation rafraîchissante + ombrage artificiel',
        priority: 10,
        data: { temperature: currentTemp, optimalMax: optimalRange.max }
      });
    } else if (currentTemp > optimalRange.max) {
      // Chaud
      recommendations.push({
        type: 'warning',
        category: 'temperature',
        title: 'Température élevée',
        message: `Température au-dessus de l'optimal (${currentTemp}°C).`,
        action: 'Augmenter fréquence irrigation',
        priority: 6,
        data: { temperature: currentTemp, optimalMax: optimalRange.max }
      });
    } else if (currentTemp < optimalRange.min * 0.8) {
      // Très froid
      recommendations.push({
        type: 'warning',
        category: 'temperature',
        title: 'Température basse',
        message: `Température sous l'optimal (${currentTemp}°C). Croissance ralentie.`,
        action: 'Protéger cultures sensibles',
        priority: 5,
        data: { temperature: currentTemp, optimalMin: optimalRange.min }
      });
    }

    return recommendations;
  }

  // Analyse pH
  analyzePH(currentPH, optimalRange) {
    const recommendations = [];

    if (currentPH < optimalRange.min) {
      // Trop acide
      recommendations.push({
        type: 'warning',
        category: 'soil',
        title: 'Sol trop acide',
        message: `pH bas (${currentPH}). Nécessite chaulage.`,
        action: `Appliquer ${this.calculateLimeRequirement(currentPH, optimalRange.min)} kg/ha de chaux`,
        priority: 8,
        data: { pH: currentPH, optimalMin: optimalRange.min }
      });
    } else if (currentPH > optimalRange.max) {
      // Trop basique
      recommendations.push({
        type: 'warning',
        category: 'soil',
        title: 'Sol trop alcalin',
        message: `pH élevé (${currentPH}).`,
        action: 'Appliquer du soufre ou matière organique acide',
        priority: 7,
        data: { pH: currentPH, optimalMax: optimalRange.max }
      });
    }

    return recommendations;
  }

  // Analyse météo
  analyzeWeather(weather, forecast, farmerProfile) {
    const recommendations = [];
    const irrigationDelay = farmerProfile?.recommendationSettings?.rainDelayIrrigation ?? true;

    // Vent fort
    if (weather.wind_speed > 15) {
      recommendations.push({
        type: 'warning',
        category: 'weather',
        title: 'Vents forts',
        message: `Vents à ${weather.wind_speed} m/s. Risque de dommages.`,
        action: 'Protéger cultures hautes et serres',
        priority: 6,
        data: { windSpeed: weather.wind_speed }
      });
    }

    // Prévision pluie abondante
    const heavyRainDay = forecast.find(day => day.rain_volume > 20);
    if (heavyRainDay && irrigationDelay) {
      recommendations.push({
        type: 'info',
        category: 'irrigation',
        title: 'Pluie abondante prévue',
        message: `${heavyRainDay.rain_volume}mm prévus ${heavyRainDay.day}`,
        action: 'Suspendre tout programme d\'irrigation',
        priority: 4,
        data: { day: heavyRainDay.day, rainVolume: heavyRainDay.rain_volume }
      });
    }

    // Sécheresse prolongée
    const dryDays = forecast.filter(day => day.rain_chance < 20).length;
    if (dryDays >= 5) {
      recommendations.push({
        type: 'warning',
        category: 'weather',
        title: 'Période sèche prolongée',
        message: `${dryDays} jours sans pluie prévue`,
        action: 'Prévoir irrigation supplémentaire',
        priority: 5,
        data: { dryDays }
      });
    }

    return recommendations;
  }

  // Analyser les tendances
  analyzeTrends(historicalData) {
    const recommendations = [];
    
    if (historicalData.length < 6) return recommendations;

    // Calculer la tendance d'humidité
    const humidityTrend = this.calculateTrend(historicalData, 'humidity');
    if (humidityTrend < -5) {
      recommendations.push({
        type: 'warning',
        category: 'trend',
        title: 'Humidité en baisse rapide',
        message: 'Tendance à la baisse détectée',
        action: 'Surveiller de près et préparer irrigation',
        priority: 6,
        data: { trend: humidityTrend }
      });
    }

    // Calculer la tendance de température
    const tempTrend = this.calculateTrend(historicalData, 'temperature');
    if (tempTrend > 3) {
      recommendations.push({
        type: 'warning',
        category: 'trend',
        title: 'Température en hausse',
        message: 'Tendance au réchauffement détectée',
        action: 'Prévoir mesures rafraîchissantes',
        priority: 5,
        data: { trend: tempTrend }
      });
    }

    return recommendations;
  }

  // Recommandations spécifiques par culture
  getCropSpecificRecommendations(cropType, currentData) {
    const recommendations = [];
    const knowledge = this.cropKnowledge[cropType];

    if (!knowledge) return recommendations;

    // Exemple pour le riz
    if (cropType === 'rice') {
      if (currentData.humidity > 75 && currentData.temperature > 30) {
        recommendations.push({
          type: 'warning',
          category: 'disease',
          title: 'Risque de pyriculariose',
          message: 'Conditions favorables aux maladies fongiques du riz',
          action: 'Surveiller feuilles et appliquer fongicide préventif si nécessaire',
          priority: 7,
          data: { disease: 'pyriculariose' }
        });
      }
    }

    // Exemple pour les tomates
    if (cropType === 'tomatoes') {
      if (currentData.humidity > 70 && currentData.temperature > 25) {
        recommendations.push({
          type: 'warning',
          category: 'disease',
          title: 'Risque de mildiou',
          message: 'Conditions idéales pour le développement du mildiou',
          action: 'Appliquez un traitement préventif à base de cuivre',
          priority: 8,
          data: { disease: 'mildiou' }
        });
      }
    }

    return recommendations;
  }

  // Générer plan d'irrigation
  generateIrrigationPlan(historicalData, forecast, cropKnowledge) {
    const avgHumidity = historicalData.reduce((sum, d) => sum + d.humidity, 0) / historicalData.length;
    const next24hRain = forecast.slice(0, 3).reduce((sum, day) => sum + (day.rain_chance || 0), 0) / 3;

    if (avgHumidity < cropKnowledge.optimalHumidity.min && next24hRain < 30) {
      return {
        type: 'info',
        category: 'planning',
        title: 'Plan d\'irrigation recommandé',
        message: `Humidité moyenne: ${avgHumidity.toFixed(1)}%, Pluie prévue: ${next24hRain.toFixed(0)}%`,
        action: `Irriguer ${this.calculateWaterAmount(avgHumidity, cropKnowledge)} litres/m² dans les 12h`,
        priority: 4,
        data: {
          avgHumidity,
          next24hRain,
          waterAmount: this.calculateWaterAmount(avgHumidity, cropKnowledge)
        }
      };
    }

    return null;
  }

  // Calculer quantité d'eau
  calculateWaterAmount(humidity, cropKnowledge) {
    const deficit = Math.max(0, cropKnowledge.optimalHumidity.min - humidity);
    return Math.round(deficit * 2); // 2 litres par % de déficit
  }

  // Calculer besoin en chaux
  calculateLimeRequirement(currentPH, targetPH) {
    const deficit = targetPH - currentPH;
    return Math.round(deficit * 500); // 500 kg/ha par point de pH
  }

  // Calculer tendance
  calculateTrend(data, field) {
    if (data.length < 2) return 0;
    
    const firstValue = data[data.length - 1][field];
    const lastValue = data[0][field];
    const timeDiff = (new Date(data[0].timestamp) - new Date(data[data.length - 1].timestamp)) / (1000 * 3600);
    
    return timeDiff > 0 ? ((lastValue - firstValue) / timeDiff).toFixed(2) : 0;
  }

  // Calculer score de santé
  calculateHealthScore(data, cropType) {
    const knowledge = this.cropKnowledge[cropType] || this.cropKnowledge.maize;
    let score = 100;

    // Pénalité humidité
    if (data.humidity < knowledge.optimalHumidity.min) {
      score -= (knowledge.optimalHumidity.min - data.humidity) * 2;
    } else if (data.humidity > knowledge.optimalHumidity.max) {
      score -= (data.humidity - knowledge.optimalHumidity.max) * 2;
    }

    // Pénalité température
    if (data.temperature < knowledge.optimalTemperature.min) {
      score -= (knowledge.optimalTemperature.min - data.temperature) * 1.5;
    } else if (data.temperature > knowledge.optimalTemperature.max) {
      score -= (data.temperature - knowledge.optimalTemperature.max) * 1.5;
    }

    // Pénalité pH
    if (data.soil_ph < knowledge.optimalPH.min) {
      score -= (knowledge.optimalPH.min - data.soil_ph) * 10;
    } else if (data.soil_ph > knowledge.optimalPH.max) {
      score -= (data.soil_ph - knowledge.optimalPH.max) * 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // Obtenir description du statut
  getStatusDescription(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Bon';
    if (score >= 40) return 'Modéré';
    if (score >= 20) return 'Faible';
    return 'Critique';
  }

  // Prioriser les recommandations
  prioritizeRecommendations(recommendations) {
    return recommendations.sort((a, b) => {
      // Priorité par type
      const typePriority = { critical: 3, warning: 2, info: 1 };
      const aType = typePriority[a.type] || 0;
      const bType = typePriority[b.type] || 0;

      if (aType !== bType) return bType - aType;
      
      // Puis par priorité numérique
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  // Générer rapport détaillé pour agriculteur
  async generateFarmerReport(userId, startDate, endDate) {
    try {
      const farmerProfile = await FarmerProfile.findOne({ userId });
      if (!farmerProfile) {
        throw new Error('Profil agriculteur non trouvé');
      }

      // Récupérer tous les capteurs de l'agriculteur
      const sensorIds = farmerProfile.plots.flatMap(plot => plot.assignedSensors);

      // Récupérer les données
      const sensorData = await SensorData.find({
        sensor_id: { $in: sensorIds },
        timestamp: { $gte: startDate, $lte: endDate }
      }).sort({ timestamp: 1 });

      // Analyser chaque capteur
      const sensorAnalyses = await Promise.all(
        sensorIds.map(async sensorId => {
          const sensorReadings = sensorData.filter(d => d.sensor_id === sensorId);
          if (sensorReadings.length === 0) return null;

          const analysis = await this.analyzeSensorData(sensorId, userId);
          return {
            sensorId,
            readings: sensorReadings.length,
            analysis: analysis.recommendations,
            summary: analysis.summary
          };
        })
      );

      // Calculer les statistiques globales
      const stats = this.calculateReportStats(sensorAnalyses, farmerProfile);

      return {
        success: true,
        report: {
          period: { startDate, endDate },
          farmer: {
            name: farmerProfile.farmName,
            location: farmerProfile.location,
            crops: farmerProfile.mainCrops
          },
          sensors: sensorAnalyses.filter(s => s !== null),
          statistics: stats,
          recommendations: this.aggregateRecommendations(sensorAnalyses),
          generatedAt: new Date()
        }
      };
    } catch (error) {
      console.error('Erreur génération rapport:', error);
      throw error;
    }
  }

  // Calculer statistiques du rapport
  calculateReportStats(sensorAnalyses, farmerProfile) {
    const stats = {
      totalReadings: 0,
      avgHealthScore: 0,
      criticalAlerts: 0,
      irrigationEvents: 0,
      waterSaved: 0,
      estimatedYieldImpact: 0
    };

    sensorAnalyses.forEach(sensor => {
      if (!sensor) return;
      
      stats.totalReadings += sensor.readings;
      stats.avgHealthScore += sensor.summary.healthScore || 0;
      stats.criticalAlerts += sensor.analysis.filter(r => r.type === 'critical').length;
      stats.irrigationEvents += sensor.analysis.filter(r => r.category === 'irrigation').length;
    });

    if (sensorAnalyses.length > 0) {
      stats.avgHealthScore = Math.round(stats.avgHealthScore / sensorAnalyses.length);
    }

    // Estimation d'impact sur le rendement
    if (stats.avgHealthScore >= 80) {
      stats.estimatedYieldImpact = '+10-15%';
    } else if (stats.avgHealthScore >= 60) {
      stats.estimatedYieldImpact = '+5-10%';
    } else if (stats.avgHealthScore >= 40) {
      stats.estimatedYieldImpact = '0-5%';
    } else {
      stats.estimatedYieldImpact = '-5-10%';
    }

    return stats;
  }

  // Agréger les recommandations
  aggregateRecommendations(sensorAnalyses) {
    const allRecs = sensorAnalyses.flatMap(s => s?.analysis || []);
    
    // Regrouper par catégorie
    const grouped = {};
    allRecs.forEach(rec => {
      if (!grouped[rec.category]) {
        grouped[rec.category] = [];
      }
      grouped[rec.category].push(rec);
    });

    // Garder les plus prioritaires par catégorie
    const aggregated = [];
    Object.keys(grouped).forEach(category => {
      const categoryRecs = grouped[category];
      const highestPriority = categoryRecs.sort((a, b) => b.priority - a.priority)[0];
      if (highestPriority) {
        aggregated.push({
          ...highestPriority,
          count: categoryRecs.length,
          sensors: categoryRecs.map(r => r.sensorId).filter((v, i, a) => a.indexOf(v) === i)
        });
      }
    });

    return aggregated.sort((a, b) => b.priority - a.priority);
  }
}

module.exports = new RecommendationService();