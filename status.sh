#!/bin/bash
# smartagrisense/status.sh

echo "📊 État de SmartAgriSense"
echo "========================"

PROJECT_ROOT=$(pwd)
echo ""

# 1. Vérifier MongoDB
echo "🗄️  MONGODB:"
if docker ps | grep -q "mongo"; then
    echo "   ✅ En cours d'exécution (Docker)"
else
    echo "   ❌ Arrêté"
fi

# 2. Vérifier l'API
echo "🔌 API GATEWAY:"
if [ -f "$PROJECT_ROOT/.api.pid" ]; then
    API_PID=$(cat "$PROJECT_ROOT/.api.pid")
    if kill -0 $API_PID 2>/dev/null; then
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            echo "   ✅ En cours d'exécution (PID: $API_PID)"
            echo "   📡 Endpoint: http://localhost:3000"
        else
            echo "   ⚠️  Processus actif mais ne répond pas (PID: $API_PID)"
        fi
    else
        echo "   ❌ PID invalide"
    fi
elif lsof -ti:3000 > /dev/null 2>&1; then
    echo "   ⚠️  Processus sur port 3000 (non géré)"
else
    echo "   ❌ Arrêté"
fi

# 3. Vérifier le Dashboard
echo "📊 DASHBOARD:"
if [ -f "$PROJECT_ROOT/.dashboard.pid" ]; then
    DASH_PID=$(cat "$PROJECT_ROOT/.dashboard.pid")
    if kill -0 $DASH_PID 2>/dev/null; then
        if curl -s http://localhost:3001 > /dev/null 2>&1; then
            echo "   ✅ En cours d'exécution (PID: $DASH_PID)"
            echo "   🌐 Interface: http://localhost:3001"
        else
            echo "   ⚠️  Processus actif mais ne répond pas (PID: $DASH_PID)"
        fi
    else
        echo "   ❌ PID invalide"
    fi
elif lsof -ti:3001 > /dev/null 2>&1; then
    echo "   ⚠️  Processus sur port 3001 (non géré)"
else
    echo "   ❌ Arrêté"
fi

# 4. Vérifier le simulateur
echo "🔧 SIMULATEUR:"
if [ -f "$PROJECT_ROOT/.simulator.pid" ]; then
    SIM_PID=$(cat "$PROJECT_ROOT/.simulator.pid")
    if kill -0 $SIM_PID 2>/dev/null; then
        echo "   ✅ En cours d'exécution (PID: $SIM_PID)"
    else
        echo "   ❌ PID invalide"
    fi
else
    echo "   ❌ Arrêté"
fi

# 5. Vérifier les logs
echo ""
echo "📋 LOGS (dernières lignes):"
echo "   API:         tail -5 api.log"
echo "   Dashboard:   tail -5 dashboard.log"
echo "   Simulateur:  tail -5 simulator.log"

echo ""
echo "🔧 COMMANDES:"
echo "   ./deploy.sh  - Démarrer/redémarrer"
echo "   ./stop.sh    - Tout arrêter"
echo "   ./status.sh  - Vérifier l'état"