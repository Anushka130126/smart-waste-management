import paho.mqtt.client as mqtt
import time
import json
import random

BROKER = "test.mosquitto.org"
TOPIC = "city/smartbins/data"

# Initial state of our bins
bins = [
    {"bin_id": "BIN_001", "lat": 30.3165, "lng": 78.0322, "fill": 20, "bat": 100},
    {"bin_id": "BIN_002", "lat": 30.3200, "lng": 78.0350, "fill": 50, "bat": 90},
    {"bin_id": "BIN_003", "lat": 30.3250, "lng": 78.0400, "fill": 75, "bat": 85},
]

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, "AdvancedBinSimulator")
client.connect(BROKER, 1883)

print("Starting Advanced IoT Simulator (Press Ctrl+C to stop)...")

try:
    while True:
        for b in bins:
            # Normal increments
            b["fill"] = min(100, b["fill"] + random.randint(0, 5))
            b["bat"] = max(0, b["bat"] - random.uniform(0.1, 0.5))
            temp = random.uniform(20.0, 35.0) 
            status = "ACTIVE"

            # Simulate Anomalies
            anomaly_chance = random.random()
            if anomaly_chance < 0.02:
                print(f"⚠️ ANOMALY: Fire detected in {b['bin_id']}!")
                temp = random.uniform(80.0, 150.0)
                status = "FIRE_ALERT"
            elif 0.02 <= anomaly_chance < 0.05:
                print(f"⚠️ ANOMALY: Battery failure in {b['bin_id']}!")
                b["bat"] = 5.0
                status = "MAINTENANCE"

            payload = {
                "bin_id": b["bin_id"],
                "latitude": b["lat"],
                "longitude": b["lng"],
                "fill_percentage": round(b["fill"], 2),
                "battery_status": round(b["bat"], 2),
                "temperature": round(temp, 2),
                "status": status,
                "timestamp": int(time.time())
            }
            
            client.publish(TOPIC, json.dumps(payload))
            print(f"Published: {payload['bin_id']} | Fill: {payload['fill_percentage']}% | Temp: {payload['temperature']}C | Status: {payload['status']}")
            
        time.sleep(5) 
except KeyboardInterrupt:
    print("Simulator stopped.")
