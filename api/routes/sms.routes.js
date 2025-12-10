const express = require('express');
const router = express.Router();
const smsService = require('../services/sms.service');
const monitoringService = require('../services/monitoring.service');
const Alert = require('../models/Alert');
const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
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

// Middleware pour vérifier si SMS est activé
const checkSMSEnabled = (req, res, next) => {
  if (process.env.SMS_ENABLED !== 'true' && process.env.NODE_ENV === 'production') {
    return res.status(503).json({ 
      error: 'Service SMS temporairement indisponible',
      info: 'Contactez l\'administrateur pour activer le service SMS'
    });
  }
  next();
};

// 1. Envoyer un SMS manuel
router.post('/send', authenticate, checkSMSEnabled, async (req, res) => {
  try {
    const { phone, message, sensor_id, alert_type = 'manual' } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ 
        error: 'Numéro de téléphone et message requis' 
      });
    }

    // Vérifier le format du numéro
    const phoneRegex = /^(\+221|00221)?[76][0-9]{8}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ 
        error: 'Format de numéro invalide. Format attendu: +221XXXXXXXXX' 
      });
    }

    // Formater le numéro
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('00') && formattedPhone.length === 13) {
      formattedPhone = formattedPhone.replace('00221', '+221');
    } else if (!formattedPhone.startsWith('+') && formattedPhone.length === 9) {
      formattedPhone = '+221' + formattedPhone;
    } else if (!formattedPhone.startsWith('+') && formattedPhone.length === 12) {
      formattedPhone = '+' + formattedPhone;
    }

    // Envoyer le SMS
    const result = await smsService.sendAlert(formattedPhone, message, `manual_${Date.now()}`);

    // Enregistrer dans l'historique
    const alert = new Alert({
      phone: formattedPhone,
      message,
      sensor_id: sensor_id || req.user?.id,
      type: alert_type,
      status: result.success ? 'sent' : 'failed',
      twilio_sid: result.sid,
      sent_by: req.user?.id,
      metadata: {
        test_mode: result.test || false,
        characters: message.length
      }
    });
    await alert.save();

    // Émettre un événement WebSocket si disponible
    if (req.io && req.user) {
      req.io.to(`farmer_${req.user.id}`).emit('sms_sent', {
        phone: formattedPhone,
        message: message.substring(0, 50) + '...',
        status: result.success ? 'sent' : 'failed',
        timestamp: new Date()
      });
    }

    res.json({
      success: result.success,
      message: result.success ? 'SMS envoyé avec succès' : 'Échec d\'envoi du SMS',
      data: {
        phone: formattedPhone,
        message_length: message.length,
        sms_count: Math.ceil(message.length / 160),
        sid: result.sid,
        test_mode: result.test || false,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Erreur envoi SMS:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'envoi du SMS',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 2. Envoyer une alerte automatique (pour les systèmes automatisés)
router.post('/alert/auto', checkSMSEnabled, async (req, res) => {
  try {
    const { sensor_id, alert_type, data, recipients = [] } = req.body;

    if (!sensor_id || !alert_type) {
      return res.status(400).json({ 
        error: 'sensor_id et alert_type requis' 
      });
    }

    // Format du message d'alerte automatique
    const message = smsService.formatAlertMessage(alert_type, {
      sensor_id,
      ...data,
      timestamp: new Date().toLocaleString('fr-FR')
    });

    let results = [];
    
    if (recipients.length > 0) {
      // Envoyer aux destinataires spécifiés
      results = await Promise.all(
        recipients.map(async phone => {
          const result = await smsService.sendAlert(phone, message, `auto_${alert_type}_${Date.now()}`);
          
          // Enregistrer l'alerte
          const alert = new Alert({
            phone,
            message,
            sensor_id,
            type: alert_type,
            level: alert_type.includes('critical') ? 'critical' : 'warning',
            status: result.success ? 'sent' : 'failed',
            twilio_sid: result.sid,
            metadata: {
              auto: true,
              alert_type,
              data
            }
          });
          await alert.save();

          return { phone, success: result.success, sid: result.sid };
        })
      );
    } else {
      // Envoyer à tous les agriculteurs concernés par ce capteur
      // (Implémentation simplifiée - en production, lier capteurs à agriculteurs)
      const defaultRecipients = process.env.FARMER_PHONES?.split(',') || [];
      
      if (defaultRecipients.length > 0) {
        const bulkResult = await smsService.sendBulkAlerts(defaultRecipients, message);
        
        // Enregistrer en masse
        const alertPromises = defaultRecipients.map(phone => {
          const alert = new Alert({
            phone,
            message,
            sensor_id,
            type: alert_type,
            level: alert_type.includes('critical') ? 'critical' : 'warning',
            status: 'sent', // Simplifié pour le bulk
            metadata: {
              auto: true,
              alert_type,
              data,
              bulk: true
            }
          });
          return alert.save();
        });
        
        await Promise.all(alertPromises);
        results = bulkResult;
      }
    }

    res.json({
      success: true,
      message: 'Alertes automatiques envoyées',
      data: {
        alert_type,
        sensor_id,
        total_sent: results.filter(r => r.success).length,
        total_failed: results.filter(r => !r.success).length,
        results: results.slice(0, 10) // Limiter la réponse
      }
    });
  } catch (error) {
    console.error('Erreur alerte automatique:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi des alertes automatiques' });
  }
});

// 3. Broadcast à tous les agriculteurs (admin seulement)
router.post('/broadcast', authenticate, checkSMSEnabled, async (req, res) => {
  try {
    // Vérifier les permissions admin
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ 
        error: 'Permission refusée. Admin uniquement.' 
      });
    }

    const { message, filter = {} } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Message requis' 
      });
    }

    // Récupérer les destinataires selon les filtres
    let recipients = [];

    if (filter.region) {
      // Filtrer par région
      const farmers = await FarmerProfile.find({
        'location.region': filter.region
      }).populate('userId');
      
      recipients = farmers
        .map(f => f.userId?.phone)
        .filter(phone => phone && phone.startsWith('+221'));
    } else if (filter.crop) {
      // Filtrer par type de culture
      const farmers = await FarmerProfile.find({
        'mainCrops.type': filter.crop
      }).populate('userId');
      
      recipients = farmers
        .map(f => f.userId?.phone)
        .filter(phone => phone && phone.startsWith('+221'));
    } else {
      // Tous les agriculteurs avec notification SMS activée
      const users = await User.find({
        userType: 'farmer',
        phone: { $exists: true, $ne: null },
        'notificationPreferences.sms': true
      });
      
      recipients = users.map(u => u.phone).filter(phone => phone);
    }

    if (recipients.length === 0) {
      return res.status(404).json({ 
        error: 'Aucun destinataire trouvé avec les filtres spécifiés' 
      });
    }

    // Limiter le nombre pour éviter les abus
    const maxRecipients = parseInt(process.env.SMS_BROADCAST_LIMIT) || 100;
    const limitedRecipients = recipients.slice(0, maxRecipients);

    // Envoyer le broadcast
    const result = await smsService.sendBulkAlerts(limitedRecipients, message);

    // Enregistrer le broadcast
    const broadcastAlert = new Alert({
      type: 'broadcast',
      level: 'info',
      message,
      status: 'sent',
      sent_by: req.user.id,
      metadata: {
        broadcast: true,
        total_recipients: limitedRecipients.length,
        filter,
        characters: message.length,
        sms_count: Math.ceil(message.length / 160)
      }
    });
    await broadcastAlert.save();

    // Enregistrer les détails individuels
    const alertPromises = limitedRecipients.map(phone => {
      const alert = new Alert({
        phone,
        message,
        type: 'broadcast',
        level: 'info',
        status: 'sent',
        sent_by: req.user.id,
        metadata: { broadcast_id: broadcastAlert._id }
      });
      return alert.save();
    });
    await Promise.all(alertPromises);

    res.json({
      success: true,
      message: `Broadcast envoyé à ${result.sent}/${limitedRecipients.length} destinataires`,
      data: {
        total_recipients: limitedRecipients.length,
        sent: result.sent,
        failed: result.failed,
        broadcast_id: broadcastAlert._id,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Erreur broadcast:', error);
    res.status(500).json({ 
      error: 'Erreur lors du broadcast',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 4. Historique des SMS
router.get('/history', authenticate, async (req, res) => {
  try {
    const { 
      limit = 50, 
      page = 1, 
      startDate, 
      endDate, 
      status,
      type 
    } = req.query;

    const query = {};

    // Filtrer par utilisateur si non-admin
    if (req.user.userType !== 'admin') {
      query.$or = [
        { sent_by: req.user.id },
        { phone: req.user.phone }
      ];
    }

    // Filtres de date
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Filtre de statut
    if (status) {
      query.status = status;
    }

    // Filtre de type
    if (type) {
      query.type = type;
    }

    const skip = (page - 1) * limit;

    const [alerts, total] = await Promise.all([
      Alert.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Alert.countDocuments(query)
    ]);

    // Ajouter des statistiques
    const stats = await Alert.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusStats = stats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        statistics: {
          total,
          ...statusStats,
          sent: statusStats.sent || 0,
          failed: statusStats.failed || 0,
          pending: statusStats.pending || 0
        }
      }
    });
  } catch (error) {
    console.error('Erreur historique:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
  }
});

// 5. Statistiques SMS
router.get('/stats', authenticate, async (req, res) => {
  try {
    // Seul admin peut voir toutes les stats
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ 
        error: 'Permission refusée. Admin uniquement.' 
      });
    }

    const { period = '30d' } = req.query;
    const endDate = new Date();
    const startDate = new Date();

    // Calculer la période
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Statistiques globales
    const [
      totalCount,
      sentCount,
      failedCount,
      dailyStats,
      typeStats,
      topRecipients
    ] = await Promise.all([
      Alert.countDocuments({ timestamp: { $gte: startDate, $lte: endDate } }),
      Alert.countDocuments({ 
        timestamp: { $gte: startDate, $lte: endDate },
        status: 'sent' 
      }),
      Alert.countDocuments({ 
        timestamp: { $gte: startDate, $lte: endDate },
        status: 'failed' 
      }),
      // Statistiques quotidiennes
      Alert.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
            },
            count: { $sum: 1 },
            sent: {
              $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Statistiques par type
      Alert.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            success_rate: {
              $avg: { $cond: [{ $eq: ['$status', 'sent'] }, 100, 0] }
            }
          }
        }
      ]),
      // Top destinataires
      Alert.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate },
            phone: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$phone',
            count: { $sum: 1 },
            last_sent: { $max: '$timestamp' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    // Calculer le coût estimé (si Twilio est configuré)
    const estimatedCost = sentCount * 0.05; // Estimation 0.05€ par SMS

    res.json({
      success: true,
      data: {
        period: {
          start: startDate,
          end: endDate,
          days: Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))
        },
        totals: {
          all: totalCount,
          sent: sentCount,
          failed: failedCount,
          success_rate: totalCount > 0 ? ((sentCount / totalCount) * 100).toFixed(2) : 0
        },
        estimated_cost: {
          amount: estimatedCost.toFixed(2),
          currency: 'EUR',
          rate_per_sms: 0.05
        },
        daily_stats: dailyStats,
        type_stats: typeStats,
        top_recipients: topRecipients,
        sms_service: {
          enabled: process.env.SMS_ENABLED === 'true',
          provider: process.env.TWILIO_ACCOUNT_SID ? 'Twilio' : 'Test Mode',
          test_mode: process.env.NODE_ENV !== 'production'
        }
      }
    });
  } catch (error) {
    console.error('Erreur statistiques:', error);
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
  }
});

// 6. Vérifier le statut d'un SMS
router.get('/status/:sid', authenticate, async (req, res) => {
  try {
    const { sid } = req.params;

    // Vérifier si le SMS existe
    const alert = await Alert.findOne({ 
      $or: [
        { twilio_sid: sid },
        { _id: sid }
      ]
    });

    if (!alert) {
      return res.status(404).json({ 
        error: 'SMS non trouvé' 
      });
    }

    // Vérifier les permissions
    if (req.user.userType !== 'admin' && 
        alert.sent_by?.toString() !== req.user.id && 
        alert.phone !== req.user.phone) {
      return res.status(403).json({ 
        error: 'Permission refusée' 
      });
    }

    // Si c'est Twilio et en production, on pourrait récupérer le statut réel
    let deliveryStatus = 'unknown';
    if (process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV === 'production') {
      // Ici on pourrait appeler l'API Twilio pour le statut réel
      // Pour l'instant, on retourne le statut stocké
      deliveryStatus = alert.status;
    }

    res.json({
      success: true,
      data: {
        sid: alert.twilio_sid || alert._id,
        phone: alert.phone,
        message: alert.message?.substring(0, 100) + (alert.message?.length > 100 ? '...' : ''),
        status: deliveryStatus,
        timestamp: alert.timestamp,
        metadata: alert.metadata || {}
      }
    });
  } catch (error) {
    console.error('Erreur statut SMS:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification du statut' });
  }
});

// 7. Test du service SMS (admin seulement)
router.post('/test', authenticate, checkSMSEnabled, async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ 
        error: 'Permission refusée. Admin uniquement.' 
      });
    }

    const { phone = req.user.phone } = req.body;

    if (!phone) {
      return res.status(400).json({ 
        error: 'Numéro de téléphone requis pour le test' 
      });
    }

    const testMessage = `📱 Test SMS SmartAgriSense
Date: ${new Date().toLocaleString('fr-FR')}
Service: ${process.env.TWILIO_ACCOUNT_SID ? 'Twilio' : 'Test Mode'}
Statut: ✅ Opérationnel`;

    const result = await smsService.sendAlert(phone, testMessage, 'test');

    // Enregistrer le test
    const testAlert = new Alert({
      phone,
      message: testMessage,
      type: 'test',
      status: result.success ? 'sent' : 'failed',
      twilio_sid: result.sid,
      sent_by: req.user.id,
      metadata: {
        test: true,
        mode: process.env.NODE_ENV,
        provider: process.env.TWILIO_ACCOUNT_SID ? 'Twilio' : 'Test'
      }
    });
    await testAlert.save();

    res.json({
      success: result.success,
      message: result.success ? 'SMS de test envoyé avec succès' : 'Échec de l\'envoi du test',
      data: {
        phone,
        provider: process.env.TWILIO_ACCOUNT_SID ? 'Twilio' : 'Test Mode',
        test_mode: result.test || false,
        sid: result.sid,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Erreur test SMS:', error);
    res.status(500).json({ 
      error: 'Erreur lors du test SMS',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 8. Webhook Twilio pour les statuts de livraison
router.post('/webhook/twilio', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // Vérifier que c'est bien Twilio qui appelle
    const twilioSignature = req.headers['x-twilio-signature'];
    
    // En production, valider la signature
    if (process.env.NODE_ENV === 'production' && process.env.TWILIO_AUTH_TOKEN) {
      // Ici, on validerait la signature Twilio
      // Pour la démo, on accepte toutes les requêtes
    }

    const { 
      MessageSid, 
      MessageStatus, 
      To, 
      From,
      ErrorCode,
      ErrorMessage 
    } = req.body;

    console.log(`📱 Webhook Twilio: ${MessageSid} - ${MessageStatus}`);

    // Mettre à jour le statut dans la base
    await Alert.findOneAndUpdate(
      { twilio_sid: MessageSid },
      {
        status: mapTwilioStatus(MessageStatus),
        metadata: {
          ...req.body,
          webhook_received: new Date(),
          error_code: ErrorCode,
          error_message: ErrorMessage
        },
        updatedAt: new Date()
      }
    );

    // Répondre à Twilio
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (error) {
    console.error('Erreur webhook Twilio:', error);
    res.status(500).send('<Response></Response>');
  }
});

// 9. Programmer un SMS différé
router.post('/schedule', authenticate, checkSMSEnabled, async (req, res) => {
  try {
    const { 
      phone, 
      message, 
      schedule_time,
      repeat = 'once',
      repeat_interval 
    } = req.body;

    if (!phone || !message || !schedule_time) {
      return res.status(400).json({ 
        error: 'phone, message et schedule_time requis' 
      });
    }

    const scheduleDate = new Date(schedule_time);
    
    if (scheduleDate <= new Date()) {
      return res.status(400).json({ 
        error: 'La date de programmation doit être dans le futur' 
      });
    }

    // Créer une alerte programmée
    const scheduledAlert = new Alert({
      phone,
      message,
      type: 'scheduled',
      status: 'scheduled',
      scheduled_for: scheduleDate,
      sent_by: req.user.id,
      metadata: {
        scheduled: true,
        repeat,
        repeat_interval,
        created_at: new Date(),
        original_message: message
      }
    });
    await scheduledAlert.save();

    // Ici, en production, on ajouterait à une queue de tâches (Bull, Agenda.js, etc.)

    res.json({
      success: true,
      message: 'SMS programmé avec succès',
      data: {
        alert_id: scheduledAlert._id,
        phone,
        scheduled_for: scheduleDate,
        repeat,
        status: 'scheduled'
      }
    });
  } catch (error) {
    console.error('Erreur programmation SMS:', error);
    res.status(500).json({ error: 'Erreur lors de la programmation du SMS' });
  }
});

// 10. Annuler un SMS programmé
router.delete('/schedule/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const alert = await Alert.findOne({
      _id: id,
      type: 'scheduled',
      status: 'scheduled'
    });

    if (!alert) {
      return res.status(404).json({ 
        error: 'SMS programmé non trouvé ou déjà envoyé' 
      });
    }

    // Vérifier les permissions
    if (req.user.userType !== 'admin' && alert.sent_by?.toString() !== req.user.id) {
      return res.status(403).json({ 
        error: 'Permission refusée' 
      });
    }

    alert.status = 'cancelled';
    alert.metadata.cancelled_at = new Date();
    alert.metadata.cancelled_by = req.user.id;
    await alert.save();

    res.json({
      success: true,
      message: 'SMS programmé annulé avec succès',
      data: {
        alert_id: alert._id,
        cancelled_at: new Date()
      }
    });
  } catch (error) {
    console.error('Erreur annulation SMS:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation du SMS' });
  }
});

// 11. Templates de messages
router.get('/templates', authenticate, async (req, res) => {
  try {
    const templates = {
      // Alertes automatiques
      humidity_critical: {
        name: 'Humidité critique',
        template: `🚨 ALERTE CRITIQUE
Capteur: {{sensor_id}}
Humidité: {{humidity}}%
→ Irrigation urgente requise
Date: {{timestamp}}`,
        variables: ['sensor_id', 'humidity', 'timestamp']
      },
      temperature_high: {
        name: 'Température élevée',
        template: `🌡️ ALERTE TEMPÉRATURE
Capteur: {{sensor_id}}
Température: {{temperature}}°C
→ Stress thermique détecté
Date: {{timestamp}}`,
        variables: ['sensor_id', 'temperature', 'timestamp']
      },
      ph_abnormal: {
        name: 'pH anormal',
        template: `⚗️ ALERTE pH
Capteur: {{sensor_id}}
pH: {{soil_ph}}
→ {{recommendation}}
Date: {{timestamp}}`,
        variables: ['sensor_id', 'soil_ph', 'recommendation', 'timestamp']
      },
      // Notifications
      irrigation_recommendation: {
        name: 'Recommandation irrigation',
        template: `💧 RECOMMANDATION
{{farm_name}}
Humidité: {{humidity}}%
→ {{action}}
Prochaine vérification: {{next_check}}`,
        variables: ['farm_name', 'humidity', 'action', 'next_check']
      },
      weather_alert: {
        name: 'Alerte météo',
        template: `🌦️ ALERTE MÉTÉO
{{region}}
{{warning}}
→ {{recommendation}}
Validité: {{validity}}`,
        variables: ['region', 'warning', 'recommendation', 'validity']
      },
      // Communications
      farmer_welcome: {
        name: 'Bienvenue agriculteur',
        template: `👋 BIENVENUE
{{farmer_name}} sur SmartAgriSense!
Votre ferme: {{farm_name}}
Contact: {{support_phone}}
Bonne agriculture! 🌾`,
        variables: ['farmer_name', 'farm_name', 'support_phone']
      },
      report_ready: {
        name: 'Rapport prêt',
        template: `📊 RAPPORT DISPONIBLE
{{farm_name}}
Période: {{period}}
→ Consultez votre dashboard
Lien: {{dashboard_url}}`,
        variables: ['farm_name', 'period', 'dashboard_url']
      }
    };

    res.json({
      success: true,
      data: {
        templates,
        variables_help: {
          sensor_id: 'ID du capteur',
          humidity: 'Humidité en %',
          temperature: 'Température en °C',
          soil_ph: 'pH du sol',
          timestamp: 'Date et heure',
          farm_name: 'Nom de la ferme',
          farmer_name: 'Nom de l\'agriculteur'
        }
      }
    });
  } catch (error) {
    console.error('Erreur templates:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des templates' });
  }
});

// 12. Envoyer un SMS depuis un template
router.post('/send/template', authenticate, checkSMSEnabled, async (req, res) => {
  try {
    const { template_name, variables, phone } = req.body;

    const templates = {
      humidity_critical: `🚨 ALERTE CRITIQUE
Capteur: ${variables.sensor_id}
Humidité: ${variables.humidity}%
→ Irrigation urgente requise
Date: ${variables.timestamp || new Date().toLocaleString('fr-FR')}`,

      temperature_high: `🌡️ ALERTE TEMPÉRATURE
Capteur: ${variables.sensor_id}
Température: ${variables.temperature}°C
→ Stress thermique détecté
Date: ${variables.timestamp || new Date().toLocaleString('fr-FR')}`,

      irrigation_recommendation: `💧 RECOMMANDATION
${variables.farm_name}
Humidité: ${variables.humidity}%
→ ${variables.action}
Prochaine vérification: ${variables.next_check || 'dans 24h'}`
    };

    const template = templates[template_name];
    
    if (!template) {
      return res.status(400).json({ 
        error: 'Template non trouvé',
        available_templates: Object.keys(templates)
      });
    }

    // Envoyer le SMS
    const result = await smsService.sendAlert(phone, template, `template_${template_name}`);

    // Enregistrer
    const alert = new Alert({
      phone,
      message: template,
      type: 'template',
      template_name,
      status: result.success ? 'sent' : 'failed',
      twilio_sid: result.sid,
      sent_by: req.user.id,
      metadata: {
        template: template_name,
        variables,
        characters: template.length
      }
    });
    await alert.save();

    res.json({
      success: result.success,
      message: result.success ? 'SMS envoyé depuis template' : 'Échec d\'envoi',
      data: {
        template: template_name,
        message_preview: template.substring(0, 100) + '...',
        characters: template.length,
        sid: result.sid
      }
    });
  } catch (error) {
    console.error('Erreur template SMS:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du template' });
  }
});

// Fonction utilitaire pour mapper les statuts Twilio
function mapTwilioStatus(twilioStatus) {
  const statusMap = {
    'queued': 'pending',
    'sent': 'sent',
    'delivered': 'delivered',
    'undelivered': 'failed',
    'failed': 'failed'
  };
  return statusMap[twilioStatus] || 'unknown';
}

// Route de santé SMS
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'sms',
    enabled: process.env.SMS_ENABLED === 'true',
    provider: process.env.TWILIO_ACCOUNT_SID ? 'Twilio' : 'Test Mode',
    timestamp: new Date()
  });
});

module.exports = router;