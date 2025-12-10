#!/bin/bash
# smartagrisense/start-with-auth.sh

echo "🚀 Démarrage de SmartAgriSense v2.0..."
echo "======================================"

# 1. Démarrer MongoDB
echo "🐳 Démarrage de MongoDB..."
docker-compose up -d mongodb mongodb-express
sleep 5

# 2. Installer dépendances
echo "📦 Installation des dépendances..."
cd api
npm install
cd ..

# 3. Lancer l'API avec authentification
echo "🔐 Démarrage de l'API avec authentification..."
cd api
npm start &
API_PID=$!
echo $API_PID > ../.api.pid

# 4. Attendre que l'API soit prête
echo "⏳ Attente du démarrage de l'API..."
sleep 8

# 5. Lancer le dashboard
echo "📊 Démarrage du Dashboard..."
cd ../dashboard
npm install
npm start &
DASHBOARD_PID=$!
echo $DASHBOARD_PID > ../.dashboard.pid

echo ""
echo "✅ SmartAgriSense v2.0 démarré !"
echo "================================"
echo ""
echo "🔐 AUTHENTIFICATION:"
echo "   Inscription téléphone: POST /api/auth/register/phone"
echo "   Inscription email:     POST /api/auth/register/email"
echo "   Connexion:             POST /api/auth/login"
echo ""
echo "👨‍🌾 AGRICULTEURS:"
echo "   Profil:                GET /api/farmer/profile"
echo "   Recommandations:       GET /api/farmer/recommendations"
echo "   Rapports:              POST /api/farmer/report"
echo ""
echo "🌐 INTERFACES:"
echo "   Dashboard:            http://localhost:3001"
echo "   API Documentation:    http://localhost:3000"
echo "   MongoDB Interface:    http://localhost:8081"
echo ""
echo "📱 MODE D'EMPLOI:"
echo "   1. Inscrivez-vous avec votre téléphone"
echo "   2. Recevez le code SMS"
echo "   3. Complétez votre profil agriculteur"
echo "   4. Ajoutez vos parcelles et cultures"
echo "   5. Recevez des recommandations personnalisées"