# sensor-simulator/simulator.py
import requests
import random
import time
import json
from datetime import datetime
from typing import Dict, List
import threading

class SmartAgriSenseSimulator:
    def __init__(self, api_url: str = "http://localhost:3000/api/sensors/data"):
        self.api_url = api_url
        self.sensors = [
            {
                "id": "sensor_001",
                "name": "Parcelle Nord",
                "location": {"lat": 14.6937, "lng": -17.4441, "name": "Dakar"},
                "crop_type": "Riz",
                "soil_type": "Argileux"
            },
            {
                "id": "sensor_002",
                "name": "Parcelle Sud",
                "location": {"lat": 14.7237, "lng": -17.4551, "name": "Rufisque"},
                "crop_type": "Maïs",
                "soil_type": "Sableux"
            },
            {
                "id": "sensor_003",
                "name": "Parcelle Est",
                "location": {"lat": 14.6637, "lng": -17.4331, "name": "Pikine"},
                "crop_type": "Tomates",
                "soil_type": "Limon"
            }
        ]
        
        self.running = False
        
    def generate_realistic_data(self, sensor: Dict) -> Dict:
        """Génère des données réalistes basées sur le type de culture"""
        base_temp = 25.0
        base_humidity = 45.0
        
        # Variation par type de culture
        if sensor["crop_type"] == "Riz":
            base_humidity = random.uniform(60, 80)
            base_temp = random.uniform(28, 35)
        elif sensor["crop_type"] == "Maïs":
            base_humidity = random.uniform(40, 60)
            base_temp = random.uniform(30, 38)
        elif sensor["crop_type"] == "Tomates":
            base_humidity = random.uniform(50, 70)
            base_temp = random.uniform(25, 32)
        
        # Variation diurne
        hour = datetime.now().hour
        if 6 <= hour <= 18:  # Jour
            temp_variation = random.uniform(2, 8)
            humidity_variation = random.uniform(-10, -5)
        else:  # Nuit
            temp_variation = random.uniform(-5, -2)
            humidity_variation = random.uniform(5, 15)
        
        # Tendance progressive (simule l'évolution naturelle)
        trend = random.choice([-0.5, 0, 0, 0.5])
        
        return {
            "sensor_id": sensor["id"],
            "humidity": max(0, min(100, base_humidity + humidity_variation + trend)),
            "temperature": max(0, min(50, base_temp + temp_variation + trend)),
            "soil_ph": round(random.uniform(5.8, 7.2), 2),
            "location": sensor["location"],
            "battery_level": random.randint(85, 100),
            "signal_strength": random.randint(75, 100),
            "timestamp": datetime.now().isoformat(),
            "metadata": {
                "crop_type": sensor["crop_type"],
                "soil_type": sensor["soil_type"],
                "sensor_name": sensor["name"]
            }
        }
    
    def send_data(self, sensor: Dict):
        """Envoie les données du capteur à l'API"""
        data = self.generate_realistic_data(sensor)
        
        try:
            response = requests.post(
                self.api_url,
                json=data,
                headers={"Content-Type": "application/json"},
                timeout=5
            )
            
            if response.status_code == 200:
                print(f"✓ {sensor['id']}: {data['humidity']:.1f}%H, {data['temperature']:.1f}°C")
            else:
                print(f"✗ {sensor['id']}: Erreur {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            print(f"✗ {sensor['id']}: {str(e)}")
    
    def start_simulation(self, interval: int = 10):
        """Démarre la simulation continue"""
        self.running = True
        print(f"🚀 Simulation démarrée (intervalle: {interval}s)")
        print("=" * 50)
        
        while self.running:
            for sensor in self.sensors:
                self.send_data(sensor)
            time.sleep(interval)
    
    def start_threaded(self, interval: int = 10):
        """Démarre la simulation dans un thread séparé"""
        thread = threading.Thread(target=self.start_simulation, args=(interval,))
        thread.daemon = True
        thread.start()
        return thread

if __name__ == "__main__":
    simulator = SmartAgriSenseSimulator()
    
    try:
        # Démarrer la simulation
        simulator.start_simulation(interval=10)
    except KeyboardInterrupt:
        simulator.running = False
        print("\n\n🛑 Simulation arrêtée")