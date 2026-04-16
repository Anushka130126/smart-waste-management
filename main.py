from fastapi import FastAPI, Depends, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from supabase import create_client, Client
from pydantic import BaseModel
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
import threading
import json
import os
import math
import io
import csv
import random
from datetime import datetime
from typing import Optional

load_dotenv()

# If the server ever freezes again on startup, just replace these os.getenv
# calls with your actual hardcoded URL and Key in quotes!
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
MQTT_BROKER = os.getenv("MQTT_BROKER", "broker.hivemq.com")

print("Initializing Supabase...")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("Supabase Connected!")

app = FastAPI(title="EcoRoute Pro: Smart Waste Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_token(authorization: Optional[str] = Header(None)):
    if os.getenv("DEV_MODE") == "true":
        return {"id": "dev-user", "email": "dev@local"}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format.")
    token = authorization.split(" ")[1]
    try:
        user = supabase.auth.get_user(token)
        if not user:
            raise HTTPException(status_code=401, detail="Unauthorized token")
        return user
    except:
        raise HTTPException(status_code=401, detail="Invalid session")

def on_message(client, userdata, msg):
    # 1. ADDED: The Raw X-Ray Print! If it hears ANYTHING, it prints here first.
    print(f"📡 MESSAGE INCOMING: {msg.payload.decode()}")

    try:
        data = json.loads(msg.payload.decode())
        needs_collection = True if data["fill_percentage"] >= 80 or data["status"] in ["FIRE_ALERT", "MAINTENANCE"] else False

        db_payload = {
            "bin_id": data["bin_id"],
            "latitude": data["latitude"],
            "longitude": data["longitude"],
            "fill_percentage": data["fill_percentage"],
            "battery_status": data["battery_status"],
            "temperature": data["temperature"],
            "status": data["status"],
            "needs_collection": needs_collection
        }

        response = supabase.table("smart_bins").upsert(db_payload).execute()
        print(f"✅ DB Updated: {data['bin_id']} is now at {data['fill_percentage']}%")

        if data["status"] == "FIRE_ALERT":
            supabase.table("alerts").insert({
                "bin_id": data["bin_id"],
                "type": "CRITICAL",
                "message": f"🔥 Fire detected! Internal temp peaked at {data['temperature']}°C"
            }).execute()

    except Exception as e:
        print(f"❌ ERROR Saving to DB: {e}")

def on_backend_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("✅ Backend successfully linked to the Broker!")
        client.subscribe("ecoroute/deveshk/smartbins")
        print("✅ Subscribed to private sensor channel.")

def start_mqtt():
    client_id = f"Devesh_Backend_{random.randint(1000, 9999)}"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id)
    client.on_connect = on_backend_connect
    client.on_message = on_message
    try:
        # 2. THE FIX: We are HARDCODING the broker to completely ignore your .env file
        client.connect("broker.hivemq.com", 1883)
        client.loop_forever()
    except Exception as e:
        print(f"❌ MQTT Failed to connect: {e}")

threading.Thread(target=start_mqtt, daemon=True).start()

# --- API ENDPOINTS ---

@app.get("/")
def health_check():
    return {"status": "System Online", "database": "Connected", "mqtt": "Listening"}

@app.get("/api/bins", dependencies=[Depends(verify_token)])
def get_all_bins():
    response = supabase.table("smart_bins").select("*").execute()
    return {"data": response.data}

@app.get("/api/alerts", dependencies=[Depends(verify_token)])
def get_alerts():
    response = supabase.table("alerts").select("*").order("created_at", desc=True).limit(20).execute()
    return {"data": response.data}

@app.post("/api/alerts/mark-read", dependencies=[Depends(verify_token)])
def mark_alerts_read():
    supabase.table("alerts").update({"is_read": True}).eq("is_read", False).execute()
    return {"status": "success"}

@app.get("/api/fleet", dependencies=[Depends(verify_token)])
def get_fleet():
    response = supabase.table("fleet_schedule").select("*").order("created_at", desc=True).execute()
    return {"data": response.data}

class FleetAssignment(BaseModel):
    driver_name: str
    truck_id: str
    zone: str
    shift: str
    status: Optional[str] = "Standby"

@app.post("/api/fleet", dependencies=[Depends(verify_token)])
def assign_fleet(payload: FleetAssignment):
    supabase.table("fleet_schedule").insert(payload.dict()).execute()
    return {"status": "assigned"}

@app.get("/api/routes/optimize", dependencies=[Depends(verify_token)])
def optimize_route():
    response = supabase.table("smart_bins").select("*").eq("needs_collection", True).execute()
    bins_to_collect = response.data

    if not bins_to_collect:
        return {"optimized_route": [], "total_stops": 0}

    current_location = {"lat": 30.3160, "lng": 78.0300}
    route = [{"stop": "DEPOT", "lat": current_location["lat"], "lng": current_location["lng"], "reason": "Base"}]
    unvisited = list(bins_to_collect)

    def calculate_distance(p1_lat, p1_lng, p2_lat, p2_lng):
        return math.sqrt((p1_lat - p2_lat)**2 + (p1_lng - p2_lng)**2)

    while unvisited:
        nearest = min(unvisited, key=lambda x: calculate_distance(current_location["lat"], current_location["lng"], x["latitude"], x["longitude"]))
        route.append({
            "stop": nearest["bin_id"],
            "reason": "Fire Alert" if nearest["status"] == "FIRE_ALERT" else f"Full ({nearest['fill_percentage']}%)",
            "lat": nearest["latitude"],
            "lng": nearest["longitude"]
        })
        current_location = {"lat": nearest["latitude"], "lng": nearest["longitude"]}
        unvisited.remove(nearest)

    route.append({"stop": "DEPOT", "lat": 30.3160, "lng": 78.0300, "reason": "Return"})
    return {"optimized_route": route, "total_stops": len(route) - 2}


# --- RESTORED EXPORT & SETTINGS ENDPOINTS ---

@app.get("/api/reports/export")
def export_report(scope: str = Query("today")):
    query = supabase.table("smart_bins").select("*")
    response = query.execute()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["bin_id", "fill_percentage", "temperature", "status", "battery_status"])
    writer.writeheader()
    for row in response.data:
        writer.writerow({k: v for k, v in row.items() if k in writer.fieldnames})

    filename = f"ecoroute_report_{scope}_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/settings")
def get_settings():
    response = supabase.table("system_settings").select("*").execute()
    return {s["key"]: s["value"] for s in response.data} if response.data else {}

class SettingsUpdate(BaseModel):
    value: dict

@app.post("/api/settings/{key}")
def update_settings(key: str, payload: SettingsUpdate):
    existing = supabase.table("system_settings").select("*").eq("key", key).execute()
    if existing.data:
        supabase.table("system_settings").update({"value": payload.value}).eq("key", key).execute()
    else:
        supabase.table("system_settings").insert({"key": key, "value": payload.value}).execute()
    return {"status": "success"}

class SensitivityUpdate(BaseModel):
    sensitivity: float

@app.post("/api/settings/sensitivity")
def update_sensitivity(payload: SensitivityUpdate):
    existing = supabase.table("system_settings").select("*").eq("key", "routing_sensitivity").execute()
    if existing.data:
        supabase.table("system_settings").update({"value": {"threshold": payload.sensitivity}}).eq("key", "routing_sensitivity").execute()
    else:
        supabase.table("system_settings").insert({"key": "routing_sensitivity", "value": {"threshold": payload.sensitivity}}).execute()
    return {"status": "success"}

@app.get("/api/settings/sensitivity")
def get_sensitivity():
    response = supabase.table("system_settings").select("value").eq("key", "routing_sensitivity").execute()
    if response.data:
        return response.data[0]["value"]
    return {"threshold": 0.05}