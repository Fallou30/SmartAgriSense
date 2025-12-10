// api/routes/auth.routes.js
const express = require('express');
const router = express.Router();
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

// Inscription par téléphone
router.post('/register/phone', async (req, res) => {
  try {
    const { phone, firstName, lastName, farmName, location } = req.body;
    
    const result = await authService.registerByPhone(phone, {
      firstName,
      lastName,
      farmName,
      location
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Vérification du code SMS
router.post('/verify/phone', async (req, res) => {
  try {
    const { phone, code } = req.body;
    
    const result = await authService.verifyPhone(phone, code);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Inscription par email
router.post('/register/email', async (req, res) => {
  try {
    const { email, password, firstName, lastName, farmName } = req.body;
    
    const result = await authService.registerByEmail(email, password, {
      firstName,
      lastName,
      farmName
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    
    const result = await authService.login(identifier, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Connexion rapide par SMS
router.post('/login/quick', async (req, res) => {
  try {
    const { phone } = req.body;
    
    const result = await authService.quickLogin(phone);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Vérifier token
router.get('/verify', authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Mettre à jour le profil
router.put('/profile', authenticate, async (req, res) => {
  try {
    const result = await authService.updateProfile(req.user.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Route de santé
router.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'auth' });
});

module.exports = router;