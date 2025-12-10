const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
const smsService = require('./sms.service');
const jwt = require('jsonwebtoken');

class AuthService {
  // Inscription par téléphone
  async registerByPhone(phone, userData) {
    try {
      // Vérifier si le téléphone existe déjà
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        throw new Error('Ce numéro de téléphone est déjà utilisé');
      }

      // Créer l'utilisateur
      const user = new User({
        phone,
        userType: 'farmer',
        ...userData
      });

      // Générer code de vérification
      const verificationCode = user.generateVerificationCode();
      
      // Sauvegarder l'utilisateur
      await user.save();

      // Envoyer SMS de vérification
      const message = `SmartAgriSense - Votre code de vérification: ${verificationCode}`;
      await smsService.sendAlert(phone, message, 'verification');

      // Créer le profil agriculteur
      const farmerProfile = new FarmerProfile({
        userId: user._id,
        farmName: userData.farmName || `Ferme de ${userData.firstName || ''}`,
        subscription: {
          plan: 'free',
          startDate: new Date(),
          status: 'active'
        }
      });
      await farmerProfile.save();

      return {
        success: true,
        userId: user._id,
        message: 'Code de vérification envoyé par SMS'
      };
    } catch (error) {
      console.error('Erreur inscription:', error);
      throw error;
    }
  }

  // Inscription par email
  async registerByEmail(email, password, userData) {
    try {
      // Vérifier si l'email existe déjà
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error('Cet email est déjà utilisé');
      }

      // Créer l'utilisateur
      const user = new User({
        email,
        password,
        userType: 'farmer',
        ...userData
      });

      await user.save();

      // Créer le profil agriculteur
      const farmerProfile = new FarmerProfile({
        userId: user._id,
        farmName: userData.farmName || `Ferme de ${userData.firstName || ''}`
      });
      await farmerProfile.save();

      // Générer token JWT
      const token = user.generateAuthToken();

      return {
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType
        }
      };
    } catch (error) {
      console.error('Erreur inscription email:', error);
      throw error;
    }
  }

  // Vérification du code SMS
  async verifyPhone(phone, code) {
    try {
      const user = await User.findOne({ 
        phone,
        verificationCode: code,
        verificationCodeExpires: { $gt: Date.now() }
      });

      if (!user) {
        throw new Error('Code invalide ou expiré');
      }

      // Marquer comme vérifié
      user.isVerified = true;
      user.verificationCode = undefined;
      user.verificationCodeExpires = undefined;
      await user.save();

      // Générer token
      const token = user.generateAuthToken();

      return {
        success: true,
        token,
        user: {
          id: user._id,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType
        }
      };
    } catch (error) {
      console.error('Erreur vérification:', error);
      throw error;
    }
  }

  // Connexion
  async login(identifier, password) {
    try {
      // Chercher par email ou téléphone
      const user = await User.findOne({
        $or: [
          { email: identifier },
          { phone: identifier }
        ]
      });

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Vérifier le mot de passe
      const isValid = await user.comparePassword(password);
      if (!isValid) {
        throw new Error('Mot de passe incorrect');
      }

      // Mettre à jour les stats de connexion
      user.lastLogin = new Date();
      user.loginCount += 1;
      await user.save();

      // Générer token
      const token = user.generateAuthToken();

      // Récupérer le profil agriculteur
      const farmerProfile = await FarmerProfile.findOne({ userId: user._id });

      return {
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          isVerified: user.isVerified,
          farmerProfile: farmerProfile || null
        }
      };
    } catch (error) {
      console.error('Erreur connexion:', error);
      throw error;
    }
  }

  // Connexion rapide par SMS (sans mot de passe)
  async quickLogin(phone) {
    try {
      const user = await User.findOne({ phone });
      
      if (!user) {
        // Inscription automatique si utilisateur non trouvé
        return await this.registerByPhone(phone, {
          firstName: 'Agriculteur',
          lastName: 'SmartAgriSense'
        });
      }

      // Générer nouveau code de vérification
      const verificationCode = user.generateVerificationCode();
      await user.save();

      // Envoyer SMS
      const message = `SmartAgriSense - Code de connexion: ${verificationCode}`;
      await smsService.sendAlert(phone, message, 'login');

      return {
        success: true,
        message: 'Code de connexion envoyé par SMS',
        userId: user._id
      };
    } catch (error) {
      console.error('Erreur connexion rapide:', error);
      throw error;
    }
  }

  // Vérifier token JWT
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      return {
        success: true,
        user: {
          id: user._id,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType
        }
      };
    } catch (error) {
      throw new Error('Token invalide');
    }
  }

  // Mettre à jour le profil
  async updateProfile(userId, updateData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Mettre à jour l'utilisateur
      Object.keys(updateData).forEach(key => {
        if (key !== 'farmerProfile') {
          user[key] = updateData[key];
        }
      });
      user.updatedAt = new Date();
      await user.save();

      // Mettre à jour le profil agriculteur si fourni
      if (updateData.farmerProfile) {
        await FarmerProfile.findOneAndUpdate(
          { userId },
          { $set: updateData.farmerProfile, updatedAt: new Date() },
          { new: true, upsert: true }
        );
      }

      const farmerProfile = await FarmerProfile.findOne({ userId });

      return {
        success: true,
        user: {
          id: user._id,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          farmerProfile
        }
      };
    } catch (error) {
      console.error('Erreur mise à jour profil:', error);
      throw error;
    }
  }
}

module.exports = new AuthService();