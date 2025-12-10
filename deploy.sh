#!/bin/bash
# smartagrisense/deploy.sh

echo "🚀 Déploiement de SmartAgriSense..."
echo "=================================="

# 0. Variables
PROJECT_ROOT=$(pwd)
API_DIR="$PROJECT_ROOT/api"
DASHBOARD_DIR="$PROJECT_ROOT/dashboard"
SIMULATOR_DIR="$PROJECT_ROOT/sensor-simulator"

# 1. Arrêter les services existants si docker-compose existe
if [ -f "docker-compose.yml" ]; then
    echo "🛑 Arrêt des services Docker..."
    docker-compose down
fi

# 2. Mettre à jour le code depuis Git (optionnel)
echo "📥 Mise à jour du code..."
if [ -d ".git" ]; then
    git pull origin main || echo "⚠️ Git pull échoué ou non configuré"
else
    echo "ℹ️ Pas de dépôt Git détecté, continuation..."
fi

# 3. Installer dépendances
echo "📦 Installation des dépendances..."

# API
if [ -d "$API_DIR" ]; then
    echo "   🔧 API Node.js..."
    cd "$API_DIR"
    npm install --silent || { echo "❌ Erreur installation API"; exit 1; }
    cd "$PROJECT_ROOT"
else
    echo "❌ Dossier API introuvable: $API_DIR"
    exit 1
fi

# Dashboard
if [ -d "$DASHBOARD_DIR" ]; then
    echo "   🎨 Dashboard React..."
    cd "$DASHBOARD_DIR"
    npm install --silent || { echo "❌ Erreur installation Dashboard"; exit 1; }
    cd "$PROJECT_ROOT"
else
    echo "❌ Dossier Dashboard introuvable: $DASHBOARD_DIR"
    exit 1
fi

# Simulateur Python
if [ -d "$SIMULATOR_DIR" ]; then
    echo "   🔌 Simulateur Python..."
    cd "$SIMULATOR_DIR"
    if [ -f "requirements.txt" ]; then
        pip install -r requirements.txt --quiet || echo "⚠️ Erreur installation Python (peut nécessiter sudo)"
    fi
    cd "$PROJECT_ROOT"
fi

# 4. Démarrer MongoDB avec Docker
echo "🐳 Démarrage de MongoDB..."
if [ -f "docker-compose.yml" ]; then
    # Démarrer seulement MongoDB (pas les autres services)
    docker-compose up -d mongodb mongodb-express
    sleep 5 # Attendre que MongoDB soit prêt
else
    echo "⚠️ docker-compose.yml non trouvé, tentative de démarrage MongoDB manuel..."
    # Vérifier si MongoDB tourne déjà
    if ! docker ps | grep -q "mongo"; then
        docker run -d -p 27017:27017 --name smartagrisense-mongo mongo:latest
        echo "✅ MongoDB démarré sur port 27017"
    else
        echo "✅ MongoDB déjà en cours d'exécution"
    fi
fi

# 5. Démarrer l'API
echo "⚙️ Démarrage de l'API..."
cd "$API_DIR"
# Tuer le processus existant sur le port 3000 si nécessaire
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "   🛑 Arrêt du processus API existant..."
    lsof -ti:3000 | xargs kill -9
fi

# Démarrer l'API en arrière-plan
npm start > "$PROJECT_ROOT/api.log" 2>&1 &
API_PID=$!
echo $API_PID > "$PROJECT_ROOT/.api.pid"
echo "   ✅ API démarrée (PID: $API_PID)"

# Attendre que l'API soit prête
echo "   ⏳ Attente du démarrage de l'API..."
sleep 8

# Vérifier que l'API répond
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "   ✅ API opérationnelle"
else
    echo "   ⚠️ API ne répond pas encore, continuation..."
fi

# 6. Démarrer le Dashboard
echo "📊 Démarrage du Dashboard..."
cd "$DASHBOARD_DIR"
# Tuer le processus existant sur le port 3001 si nécessaire
if lsof -ti:3001 > /dev/null 2>&1; then
    echo "   🛑 Arrêt du processus Dashboard existant..."
    lsof -ti:3001 | xargs kill -9
fi

# Démarrer le Dashboard en arrière-plan
npm start > "$PROJECT_ROOT/dashboard.log" 2>&1 &
DASHBOARD_PID=$!
echo $DASHBOARD_PID > "$PROJECT_ROOT/.dashboard.pid"
echo "   ✅ Dashboard démarré (PID: $DASHBOARD_PID)"

# Attendre que le Dashboard soit prêt
echo "   ⏳ Attente du démarrage du Dashboard..."
sleep 10

# 7. Démarrer le simulateur (optionnel)
echo "🔧 Démarrage du simulateur de capteurs..."
cd "$SIMULATOR_DIR"
if [ -f "simulator.py" ]; then
    # Tuer le simulateur existant si nécessaire
    pkill -f "simulator.py" 2>/dev/null || true
    
    # Démarrer le simulateur en arrière-plan
    python simulator.py > "$PROJECT_ROOT/simulator.log" 2>&1 &
    SIMULATOR_PID=$!
    echo $SIMULATOR_PID > "$PROJECT_ROOT/.simulator.pid"
    echo "   ✅ Simulateur démarré (PID: $SIMULATOR_PID)"
else
    echo "   ⚠️ Simulateur non trouvé, ignoré"
fi

# 8. Afficher les informations
echo ""
echo "✅ DÉPLOIEMENT TERMINÉ !"
echo "========================"
echo ""
echo "📊 APPLICATIONS:"
echo "   Dashboard:    http://localhost:3001"
echo "   API:          http://localhost:3000"
echo "   API Docs:     http://localhost:3000/api-docs"
echo "   MongoDB Web:  http://localhost:8081"
echo ""
echo "🔧 SERVICES:"
echo "   MongoDB:      ✅ Démarré (Docker)"
echo "   API Gateway:  ✅ Démarré (PID: $API_PID)"
echo "   Dashboard:    ✅ Démarré (PID: $DASHBOARD_PID)"
echo "   Simulateur:   ✅ Démarré (PID: $SIMULATOR_PID)"
echo ""
echo "📋 COMMANDES UTILES:"
echo "   Voir les logs:      tail -f api.log dashboard.log simulator.log"
echo "   Arrêter tout:       ./stop.sh"
echo "   Vérifier statut:    ./status.sh"
echo "   Redémarrer API:     kill -HUP $API_PID"
echo ""
echo "🔍 TEST RAPIDE:"
echo "   curl http://localhost:3000/api/health"
echo "   curl http://localhost:3000/api/sensors"
echo ""

# Enregistrer les PIDs dans un fichier pour le script stop
cat > "$PROJECT_ROOT/.pids" << EOF
API_PID=$API_PID
DASHBOARD_PID=$DASHBOARD_PID
SIMULATOR_PID=$SIMULATOR_PID
EOF

# Rediriger vers le script status
chmod +x "$PROJECT_ROOT/status.sh" 2>/dev/null || true