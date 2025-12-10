#!/bin/bash
# smartagrisense/start.sh

echo "🚀 Démarrage de SmartAgriSense..."
echo "================================"

# Charger les variables d'environnement
export $(cat .env | grep -v '^#' | xargs)

# 1. Démarrer MongoDB avec Docker
echo "🐳 Démarrage de MongoDB..."
docker-compose -f docker/docker-compose.yml up -d mongodb

# Attendre que MongoDB soit prêt
sleep 5

# 2. Démarrer l'API
echo "⚙️ Démarrage de l'API..."
cd api
npm install
npm start &
API_PID=$!
cd ..

# 3. Démarrer le Dashboard
echo "📊 Démarrage du Dashboard..."
cd dashboard
npm install
npm start &
DASHBOARD_PID=$!
cd ..

# 4. Démarrer le simulateur
echo "🔧 Démarrage du simulateur..."
cd sensor-simulator
pip install -r requirements.txt
python simulator.py &
SIMULATOR_PID=$!
cd ..

echo ""
echo "✅ SmartAgriSense démarré avec succès!"
echo ""
echo "📊 Dashboard:  http://localhost:3001"
echo "🔌 API:        http://localhost:3000"
echo "📚 Documentation: http://localhost:3000/api-docs"
echo "🗄️  MongoDB:    http://localhost:8081 (admin/password)"
echo ""
echo "📱 Numéros de test SMS:"
echo "   +221771234567"
echo "   +221779876543"
echo "   +221763456789"
echo ""
echo "🛑 Pour arrêter: ./stop.sh"
echo ""

# Enregistrer les PIDs
echo $API_PID > .api.pid
echo $DASHBOARD_PID > .dashboard.pid
echo $SIMULATOR_PID > .simulator.pid

# Attendre Ctrl+C
trap 'echo "Arrêt en cours..."; ./stop.sh; exit' INT
wait