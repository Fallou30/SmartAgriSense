#!/bin/bash
# smartagrisense/stop.sh

echo "🛑 Arrêt de SmartAgriSense..."
echo "============================="

PROJECT_ROOT=$(pwd)

# 1. Arrêter les processus Node.js
echo "🔌 Arrêt des applications Node.js..."

# API
if [ -f "$PROJECT_ROOT/.api.pid" ]; then
    API_PID=$(cat "$PROJECT_ROOT/.api.pid")
    if kill -0 $API_PID 2>/dev/null; then
        kill $API_PID
        echo "   ✅ API arrêtée (PID: $API_PID)"
    fi
    rm -f "$PROJECT_ROOT/.api.pid"
fi

# Dashboard
if [ -f "$PROJECT_ROOT/.dashboard.pid" ]; then
    DASH_PID=$(cat "$PROJECT_ROOT/.dashboard.pid")
    if kill -0 $DASH_PID 2>/dev/null; then
        kill $DASH_PID
        echo "   ✅ Dashboard arrêté (PID: $DASH_PID)"
    fi
    rm -f "$PROJECT_ROOT/.dashboard.pid"
fi

# Simulateur
if [ -f "$PROJECT_ROOT/.simulator.pid" ]; then
    SIM_PID=$(cat "$PROJECT_ROOT/.simulator.pid")
    if kill -0 $SIM_PID 2>/dev/null; then
        kill $SIM_PID
        echo "   ✅ Simulateur arrêté (PID: $SIM_PID)"
    fi
    rm -f "$PROJECT_ROOT/.simulator.pid"
fi

# Tuer tout processus restant sur les ports
echo "🔍 Nettoyage des processus restants..."
pkill -f "node server.js" 2>/dev/null || true
pkill -f "react-scripts start" 2>/dev/null || true
pkill -f "simulator.py" 2>/dev/null || true

# 2. Arrêter Docker Compose si présent
if [ -f "docker-compose.yml" ]; then
    echo "🐳 Arrêt des services Docker..."
    docker-compose down
    echo "   ✅ Services Docker arrêtés"
else
    # Arrêter le conteneur MongoDB manuel
    if docker ps | grep -q "smartagrisense-mongo"; then
        echo "🐳 Arrêt de MongoDB..."
        docker stop smartagrisense-mongo
        docker rm smartagrisense-mongo
        echo "   ✅ MongoDB arrêté"
    fi
fi

# 3. Nettoyer les fichiers PID et logs
rm -f "$PROJECT_ROOT/.api.pid" "$PROJECT_ROOT/.dashboard.pid" "$PROJECT_ROOT/.simulator.pid" "$PROJECT_ROOT/.pids"

echo ""
echo "✅ SmartAgriSense complètement arrêté !"
echo "📊 Pour redémarrer: ./deploy.sh"