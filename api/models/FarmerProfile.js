// api/models/FarmerProfile.js
const mongoose = require('mongoose');

const farmerProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Informations agricoles
  farmName: String,
  farmSize: Number, // en hectares
  farmType: {
    type: String,
    enum: ['cereal', 'vegetable', 'fruit', 'livestock', 'mixed'],
    default: 'mixed'
  },
  
  // Cultures principales
  mainCrops: [{
    name: String,
    type: String,
    area: Number, // hectares
    plantingDate: Date,
    expectedHarvest: Date,
    variety: String
  }],
  
  // Système d'irrigation
  irrigationSystem: {
    type: String,
    enum: ['drip', 'sprinkler', 'flood', 'manual', 'none'],
    default: 'manual'
  },
  irrigationCapacity: Number, // m³/heure
  
  // Équipements
  equipment: [{
    name: String,
    type: String,
    quantity: Number,
    status: String
  }],
  
  // Parcelles
  plots: [{
    name: String,
    area: Number,
    soilType: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    assignedSensors: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sensor'
    }]
  }],
  
  // Historique de récolte
  harvestHistory: [{
    year: Number,
    crop: String,
    yield: Number, // tonnes
    quality: String,
    revenue: Number
  }],
  
  // Préférences de recommandations
  recommendationSettings: {
    irrigationThreshold: { type: Number, default: 40 },
    temperatureAlert: { type: Number, default: 38 },
    rainDelayIrrigation: { type: Boolean, default: true },
    diseaseWarning: { type: Boolean, default: true }
  },
  
  // Métriques de performance
  performance: {
    waterSaved: { type: Number, default: 0 }, // en m³
    yieldIncrease: { type: Number, default: 0 }, // en %
    costReduction: { type: Number, default: 0 }, // en %
    lastEvaluation: Date
  },
  
  // Souscription
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active'
    }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index
farmerProfileSchema.index({ userId: 1 });
farmerProfileSchema.index({ 'plots.coordinates': '2dsphere' });
farmerProfileSchema.index({ farmType: 1 });

// Méthode pour calculer les statistiques
farmerProfileSchema.methods.calculateStats = function() {
  const totalArea = this.plots.reduce((sum, plot) => sum + (plot.area || 0), 0);
  const sensorCount = this.plots.reduce((sum, plot) => sum + (plot.assignedSensors?.length || 0), 0);
  
  return {
    totalArea,
    plotCount: this.plots.length,
    sensorCount,
    cropCount: this.mainCrops.length
  };
};

module.exports = mongoose.model('FarmerProfile', farmerProfileSchema);