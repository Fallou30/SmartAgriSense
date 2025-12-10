const express = require('express');
const router = express.Router();
const FarmerProfile = require('../models/FarmerProfile');
const recommendationService = require('../services/recommendation.service');
const authService = require('../services/auth.service');

// Middleware d'authentification
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const result = await authService.verifyToken(token);
    req.user = result.user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// Récupérer le profil agriculteur
router.get('/profile', authenticate, async (req, res) => {
  try {
    const profile = await FarmerProfile.findOne({ userId: req.user.id })
      .populate('plots.assignedSensors');
    
    if (!profile) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    res.json({
      success: true,
      profile: {
        ...profile.toObject(),
        stats: profile.calculateStats()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mettre à jour le profil agriculteur
router.put('/profile', authenticate, async (req, res) => {
  try {
    const updates = req.body;
    
    const profile = await FarmerProfile.findOneAndUpdate(
      { userId: req.user.id },
      { 
        $set: updates,
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      profile,
      stats: profile.calculateStats()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Ajouter une parcelle
router.post('/plots', authenticate, async (req, res) => {
  try {
    const { plot } = req.body;
    
    const profile = await FarmerProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    profile.plots.push(plot);
    await profile.save();

    res.json({
      success: true,
      plot,
      totalPlots: profile.plots.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Ajouter une culture
router.post('/crops', authenticate, async (req, res) => {
  try {
    const { crop } = req.body;
    
    const profile = await FarmerProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    profile.mainCrops.push(crop);
    await profile.save();

    res.json({
      success: true,
      crop,
      totalCrops: profile.mainCrops.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtenir les recommandations personnalisées
router.get('/recommendations', authenticate, async (req, res) => {
  try {
    const profile = await FarmerProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    // Récupérer tous les capteurs de l'agriculteur
    const sensorIds = profile.plots.flatMap(plot => plot.assignedSensors);

    // Analyser chaque capteur
    const analyses = await Promise.all(
      sensorIds.map(sensorId => 
        recommendationService.analyzeSensorData(sensorId.toString(), req.user.id)
      )
    );

    // Agréger les recommandations
    const allRecommendations = analyses.flatMap(a => a.recommendations || []);
    const aggregated = recommendationService.prioritizeRecommendations(allRecommendations);

    // Calculer le score moyen
    const avgScore = analyses.length > 0 
      ? Math.round(analyses.reduce((sum, a) => sum + (a.summary?.healthScore || 0), 0) / analyses.length)
      : 0;

    res.json({
      success: true,
      recommendations: aggregated.slice(0, 10), // Top 10
      summary: {
        totalSensors: sensorIds.length,
        avgHealthScore: avgScore,
        status: recommendationService.getStatusDescription(avgScore),
        criticalCount: aggregated.filter(r => r.type === 'critical').length,
        warningCount: aggregated.filter(r => r.type === 'warning').length
      },
      generatedAt: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Générer un rapport détaillé
router.post('/report', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    const result = await recommendationService.generateFarmerReport(
      req.user.id,
      new Date(startDate),
      new Date(endDate)
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Statistiques de l'agriculteur
router.get('/stats', authenticate, async (req, res) => {
  try {
    const profile = await FarmerProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    const stats = profile.calculateStats();
    const performance = profile.performance || {};

    // Calculer des métriques supplémentaires
    const today = new Date();
    const activeCrops = profile.mainCrops.filter(crop => {
      if (!crop.expectedHarvest) return true;
      return new Date(crop.expectedHarvest) > today;
    });

    res.json({
      success: true,
      stats: {
        ...stats,
        activeCrops: activeCrops.length,
        performance,
        subscription: profile.subscription
      },
      recentActivity: {
        lastUpdate: profile.updatedAt,
        plotCount: profile.plots.length,
        equipmentCount: profile.equipment?.length || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mettre à jour les préférences
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { preferences } = req.body;
    
    const profile = await FarmerProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    profile.recommendationSettings = {
      ...profile.recommendationSettings,
      ...preferences
    };
    await profile.save();

    res.json({
      success: true,
      preferences: profile.recommendationSettings
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;