// api/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Informations de base
  email: {
    type: String,
    unique: true,
    lowercase: true,
    sparse: true
  },
  phone: {
    type: String,
    unique: true,
    sparse: true
  },
  password: {
    type: String,
    required: function() {
      return !this.phone; // Mot de passe requis seulement pour email
    }
  },
  
  // Type d'utilisateur
  userType: {
    type: String,
    enum: ['farmer', 'admin', 'technician'],
    default: 'farmer'
  },
  
  // Informations personnelles
  firstName: String,
  lastName: String,
  location: {
    region: String,
    department: String,
    village: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  // Configuration
  language: {
    type: String,
    enum: ['fr', 'en', 'wo', 'ar'],
    default: 'fr'
  },
  notificationPreferences: {
    sms: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },
  
  // Sécurité
  isVerified: { type: Boolean, default: false },
  verificationCode: String,
  verificationCodeExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Métadonnées
  lastLogin: Date,
  loginCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index pour recherches rapides
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ location: '2dsphere' });

// Hash du mot de passe avant sauvegarde
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour vérifier le mot de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Méthode pour générer un token JWT
userSchema.methods.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { 
      userId: this._id,
      userType: this.userType,
      phone: this.phone,
      email: this.email 
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Méthode pour générer un code de vérification
userSchema.methods.generateVerificationCode = function() {
  this.verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  this.verificationCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return this.verificationCode;
};

module.exports = mongoose.model('User', userSchema);