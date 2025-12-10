#!/bin/bash
# smartagrisense/restart.sh

echo "🔄 Redémarrage de SmartAgriSense..."
echo "=================================="

# Arrêter proprement
./stop.sh

# Attendre 2 secondes
sleep 2

# Redémarrer
./deploy.sh