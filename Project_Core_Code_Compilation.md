# Smart Waste Project - Core Code Compilation

This document contains the core code files for the Smart Waste Management project. Sensitive information has been redacted.

## Environment Variables (Sensitive values redacted)\n**File:** .env\n\n`env\nSUPABASE_URL=<YOUR_SUPABASE_URL_HERE>
SUPABASE_KEY=<YOUR_SUPABASE_KEY_HERE>
MQTT_BROKER=<YOUR_MQTT_BROKER_HERE>
MQTT_PORT=<YOUR_MQTT_PORT_HERE>
DEV_MODE=<YOUR_DEV_MODE_HERE>
\n`\n\n---\n\n## Backend Entry Point (FastAPI)\n**File:** main.py\n\n`python\nfrom fastapi import FastAPI, Depends, HTTPException, Header, Query
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
from datetime import datetime
from typing import Optional

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
MQTT_BROKER = os.getenv("MQTT_BROKER", "test.mosquitto.org")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
app = FastAPI(title="EcoRoute Pro: Smart Waste Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fix 422 error: Use Optional[str] for Header
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
        
        # 1. Update Bin Status
        supabase.table("smart_bins").upsert(db_payload).execute()
        
        # 2. Log Alerts into new 'alerts' table
        if data["status"] == "FIRE_ALERT":
            supabase.table("alerts").insert({
                "bin_id": data["bin_id"],
                "type": "CRITICAL",
                "message": f"🔥 Fire detected! Internal temp peaked at {data['temperature']}°C"
            }).execute()
            print(f"🚨 CRITICAL ALERT: Fire logged for {data['bin_id']}!")
        elif data["fill_percentage"] >= 90:
             supabase.table("alerts").insert({
                "bin_id": data["bin_id"],
                "type": "WARNING",
                "message": f"🗑️ Bin is nearly full ({data['fill_percentage']}%). Needs priority collection."
            }).execute()
            
    except Exception as e:
        print(f"Error processing MQTT message: {e}")

def start_mqtt():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, "FastAPI_Supabase_Backend")
    client.on_message = on_message
    client.connect(MQTT_BROKER, int(os.getenv("MQTT_PORT", 1883)))
    client.subscribe("city/smartbins/data")
    print("MQTT Background Listener Started...")
    client.loop_forever()

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

@app.get("/api/settings", dependencies=[Depends(verify_token)])
def get_settings():
    response = supabase.table("system_settings").select("*").execute()
    return {s["key"]: s["value"] for s in response.data}

class SettingsUpdate(BaseModel):
    value: dict

@app.post("/api/settings/{key}", dependencies=[Depends(verify_token)])
def update_settings(key: str, payload: SettingsUpdate):
    supabase.table("system_settings").update({"value": payload.value}).eq("key", key).execute()
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

class SensitivityUpdate(BaseModel):
    sensitivity: float

@app.post("/api/settings/sensitivity", dependencies=[Depends(verify_token)])
def update_sensitivity(payload: SensitivityUpdate):
    # Depending on DB constraints, upsert or update. Since it's a key-value store.
    existing = supabase.table("system_settings").select("*").eq("key", "routing_sensitivity").execute()
    if existing.data:
        supabase.table("system_settings").update({"value": {"threshold": payload.sensitivity}}).eq("key", "routing_sensitivity").execute()
    else:
        supabase.table("system_settings").insert({"key": "routing_sensitivity", "value": {"threshold": payload.sensitivity}}).execute()
    return {"status": "success"}

@app.get("/api/settings/sensitivity", dependencies=[Depends(verify_token)])
def get_sensitivity():
    response = supabase.table("system_settings").select("value").eq("key", "routing_sensitivity").execute()
    if response.data:
        return response.data[0]["value"]
    return {"threshold": 0.05}

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

@app.get("/api/reports/export", dependencies=[Depends(verify_token)])
def export_report(scope: str = Query("today")):
    # Fetch Data
    query = supabase.table("smart_bins").select("*")
    # In a real app, 'today' would filter by timestamp. Supabase syntax: .gte('updated_at', '2026-04-12')
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
\n`\n\n---\n\n## IoT Simulator Script\n**File:** iot_simulator.py\n\n`python\nimport paho.mqtt.client as mqtt
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
\n`\n\n---\n\n## Database Setup Script\n**File:** setup_database_v2.sql\n\n`sql\n-- EcoRoute IoT: Database Expansion Script (Phase 2)
-- Run this in your Supabase SQL Editor

-- 1. Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bin_id TEXT,
    type TEXT, -- CRITICAL, WARNING, INFO
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE
);

-- 2. System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Fleet Schedule Table
CREATE TABLE IF NOT EXISTS fleet_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_name TEXT,
    truck_id TEXT,
    zone TEXT,
    shift TEXT,
    status TEXT DEFAULT 'Standby', -- On Route, Standby, Completed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS Policies (Allowing anon access for local dev mode)
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_schedule ENABLE ROW LEVEL SECURITY;

-- Dynamic Policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Anon Select Alerts" ON alerts;
    CREATE POLICY "Anon Select Alerts" ON alerts FOR SELECT TO anon USING (true);
    
    DROP POLICY IF EXISTS "Anon Insert Alerts" ON alerts;
    CREATE POLICY "Anon Insert Alerts" ON alerts FOR INSERT TO anon WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon All Settings" ON system_settings;
    CREATE POLICY "Anon All Settings" ON system_settings FOR ALL TO anon USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon All Fleet" ON fleet_schedule;
    CREATE POLICY "Anon All Fleet" ON fleet_schedule FOR ALL TO anon USING (true) WITH CHECK (true);
END $$;

-- 5. Seed Initial Settings
INSERT INTO system_settings (key, value, description)
VALUES 
('thresholds', '{"fill_critical": 90, "temp_critical": 80, "battery_warning": 15}', 'Critical thresholds for alerts'),
('system_info', '{"sector": "Dehradun Central", "admin": "Siddharth", "version": "2.1.0"}', 'Meta information about the system')
ON CONFLICT (key) DO NOTHING;
\n`\n\n---\n\n## Frontend Layout Root\n**File:** smart-waste-ui/app/layout.js\n\n`javascript\n"use client";
import './globals.css';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Map, Calendar, Route, BarChart3, Settings, Bell, User, Clock, Check, Trash2, ShieldAlert
} from 'lucide-react';

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  const fetchAlerts = async () => {
    try {
      const resp = await fetch('http://localhost:8000/api/alerts');
      const data = await resp.json();
      if (data.data) setAlerts(data.data);
    } catch (e) { /* ignore to prevent next.js dev overlay */ }
  };

  useEffect(() => {
    fetchAlerts();
    const inv = setInterval(fetchAlerts, 10000);
    return () => clearInterval(inv);
  }, []);

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <html lang="en">
      <body className="flex h-screen bg-bg-main text-slate-900 font-sans selection:bg-emerald-100">
        <aside className="w-72 glass-sidebar flex flex-col z-20">
          <div className="p-8">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                <Route className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-800">EcoRoute</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">IoT Network Manager</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
            <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Menu</div>
            <NavItem href="/" icon={<LayoutDashboard size={20} />} label="Dashboard" active={pathname === "/"} />
            <NavItem href="/monitoring" icon={<Map size={20} />} label="Live Monitoring" active={pathname === "/monitoring"} />
            <NavItem href="/scheduling" icon={<Calendar size={20} />} label="Fleet Schedule" active={pathname === "/scheduling"} />
            <NavItem href="/optimization" icon={<Route size={20} />} label="Dynamic Routing" active={pathname === "/optimization"} />
            <NavItem href="/analytics" icon={<BarChart3 size={20} />} label="System Analytics" active={pathname === "/analytics"} />
            
            <div className="px-4 py-2 mt-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preferences</div>
            <NavItem href="/settings" icon={<Settings size={20} />} label="Settings" active={pathname === "/settings"} />
          </nav>

          <div className="p-4 m-4 bg-white/50 rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 ring-2 ring-white">
                <User size={20} />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-slate-800 truncate">Devesh Khurana</p>
                <p className="text-xs text-slate-400 truncate">Dehradun Sector</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <header className="h-20 flex items-center justify-between px-10 bg-white/40 backdrop-blur-sm border-b border-slate-200/50 flex-shrink-0 z-30">
            <div>
              <h2 className="text-sm font-semibold text-slate-500">System Live</h2>
              <p className="text-xs text-slate-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            <div className="flex items-center space-x-4 relative">
              <button 
                onClick={() => setShowNotifs(!showNotifs)}
                className={`p-2.5 rounded-full bg-white border border-slate-200 transition-all relative ${showNotifs ? 'text-emerald-600 ring-4 ring-emerald-50' : 'text-slate-500 hover:text-emerald-600'}`}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2.5 w-4 h-4 bg-rose-500 text-[10px] text-white font-bold flex items-center justify-center rounded-full border-2 border-white ring-1 ring-rose-200">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifs && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute top-14 right-0 w-96 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-50"
                  >
                    <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800">Recent Alerts</h3>
                      <button 
                        onClick={async () => {
                          setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
                          try {
                            await fetch('http://localhost:8000/api/alerts/mark-read', { method: 'POST' });
                            fetchAlerts();
                          } catch (e) { console.error("Mark read failed"); }
                        }}
                        className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:underline"
                      >
                        Mark as Read
                      </button>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                      {alerts.length > 0 ? (
                        alerts.map((alert) => (
                          <div key={alert.id} className="p-4 border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                            <div className="flex space-x-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${alert.type === 'CRITICAL' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
                                {alert.type === 'CRITICAL' ? <ShieldAlert size={16} /> : <Clock size={16} />}
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-slate-800 leading-tight">{alert.message}</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">{alert.bin_id} · {new Date(alert.created_at).toLocaleTimeString()}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-12 text-center">
                          <Check size={40} className="mx-auto text-emerald-200 mb-4" />
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No active alerts</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}

function NavItem({ href, icon, label, active }) {
  return (
    <Link 
      href={href} 
      className={`
        flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300
        ${active 
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-[1.02]' 
          : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
        }
      `}
    >
      <span className={active ? 'text-white' : 'text-slate-400'}>{icon}</span>
      <span className="font-semibold text-sm">{label}</span>
    </Link>
  );
}
\n`\n\n---\n\n## Frontend Dashboard (Home)\n**File:** smart-waste-ui/app/page.js\n\n`javascript\n"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, CheckCircle, Truck, Zap, ArrowUpRight, ArrowDownRight, 
  Activity, X, Navigation, RefreshCw, FileText, Download, ShieldCheck
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

// Removed STATIC_TREND, all data is pulled live from API.

export default function AdminDashboard() {
  const [bins, setBins] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState('today');

  const fetchData = async () => {
    try {
      const [binsResp, alertsResp, fleetResp] = await Promise.all([
        fetch('http://localhost:8000/api/bins'),
        fetch('http://localhost:8000/api/alerts'),
        fetch('http://localhost:8000/api/fleet')
      ]);
      const [binsData, alertsData, fleetData] = await Promise.all([binsResp.json(), alertsResp.json(), fleetResp.json()]);
      if (binsData.data) setBins(binsData.data.sort((a,b) => a.bin_id.localeCompare(b.bin_id)));
      if (alertsData.data) setAlerts(alertsData.data);
      if (fleetData.data) setFleet(fleetData.data);
    } catch (e) {
      console.warn("Dashboard sync warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const inv = setInterval(fetchData, 5000);
    return () => clearInterval(inv);
  }, []);

  const handleExport = () => {
    window.open(`http://localhost:8000/api/reports/export?scope=${exportScope}`, '_blank');
    setShowExportModal(false);
  };

  const activeBinsRes = bins.length;
  const criticalCount = bins.filter(b => b.status === 'FIRE_ALERT' || b.fill_percentage >= 90).length;
  const onRouteCount = fleet.filter(f => f.status === 'On Route').length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Network Health" 
          value={loading ? "..." : "Optimal"} 
          sub="99% Database Sync"
          icon={<ShieldCheck size={22} className="text-emerald-500" />} 
          trend={+1.2}
        />
        <StatCard 
          title="Monitored Bins" 
          value={loading ? "..." : activeBinsRes} 
          sub="Live Telemetry Nodes"
          icon={<Zap size={22} className="text-blue-500" />} 
          trend={+0.0}
        />
        <StatCard 
          title="Operational Trucks" 
          value={loading ? "..." : onRouteCount} 
          sub="Live From Scheduler"
          icon={<Truck size={22} className="text-indigo-500" />} 
          trend={+onRouteCount > 0 ? 100 : 0}
        />
        <StatCard 
          title="Critical Tasks" 
          value={loading ? "..." : criticalCount} 
          sub="High Priority Alerts"
          icon={<AlertTriangle size={22} className="text-rose-500" />} 
          trend={+criticalCount > 0 ? 100 : 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col h-[480px]">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-800">System Capacity</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Real-time Fill Percentage Trends</p>
            </div>
          </div>
          <div className="flex-1 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bins}>
                <defs>
                  <linearGradient id="colorFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="bin_id" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontWeight: 'bold', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '10px' }}
                />
                <Area type="monotone" dataKey="fill_percentage" name="Fill Level %" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl overflow-hidden relative group border border-white/5">
          <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
             <Activity size={140} className="text-emerald-500" />
          </div>
          
          <h2 className="text-xl font-bold text-white mb-6 relative z-10 flex items-center justify-between">
            <span>Live Feed</span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
          </h2>
          <div className="space-y-4 relative z-10 font-mono h-[280px] overflow-y-auto pr-2 custom-scrollbar">
            {alerts.length > 0 ? alerts.map(alert => (
              <IngestionItem 
                key={alert.id}
                bin={alert.bin_id}
                status={alert.type}
                data={alert.message}
                color={alert.type === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'}
              />
            )) : (
              <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-white text-xs">
                Scanning IoT Network...
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
            <button 
              onClick={() => window.location.href = '/monitoring'}
              className="w-full bg-emerald-600 text-white rounded-2xl py-4 font-bold hover:bg-emerald-500 transition-all shadow-lg flex items-center justify-center space-x-2"
            >
              <span>Full Telemetry</span>
              <ArrowUpRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-10">
           <div>
              <h2 className="text-2xl font-black text-slate-800">Operations Hub</h2>
              <p className="text-sm text-slate-400 font-medium">Global system control and persistent reporting.</p>
           </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <OpCard 
            title="Dynamic Optimizer" 
            desc="Run AI recalculation for current full bins across Dehradun sector."
            action="Calculate Route"
            variant="emerald"
            onClick={() => window.location.href='/optimization'}
          />
          <OpCard 
            title="Fleet Manager" 
            desc="Deploy trucks and manage driver assignments."
            action="Open Scheduler"
            variant="blue"
            onClick={() => window.location.href='/scheduling'}
          />
          <OpCard 
            title="System Reporting" 
            desc="Generate persistent CSV archives for audit and billing logs."
            action="Generate Report"
            variant="slate"
            onClick={() => setShowExportModal(true)}
          />
        </div>
      </div>

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
               initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
               className="bg-white rounded-[3rem] p-10 w-full max-w-md shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-slate-100 text-slate-800 rounded-3xl mx-auto flex items-center justify-center mb-8">
                 <FileText size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">Export Data Archive</h3>
              <p className="text-slate-500 font-medium mb-10">Select the scope of the telemetry report to generate.</p>
              
              <div className="space-y-4 mb-10">
                <button 
                   onClick={() => setExportScope('today')}
                   className={`w-full p-5 rounded-[1.5rem] border-2 transition-all text-left flex items-center justify-between ${exportScope === 'today' ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <span className="font-bold">Today's History</span>
                  {exportScope === 'today' && <CheckCircle size={20} className="text-emerald-600" />}
                </button>
                <button 
                   onClick={() => setExportScope('all')}
                   className={`w-full p-5 rounded-[1.5rem] border-2 transition-all text-left flex items-center justify-between ${exportScope === 'all' ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <span className="font-bold">All-Time Database Dump</span>
                  {exportScope === 'all' && <CheckCircle size={20} className="text-emerald-600" />}
                </button>
              </div>

              <div className="flex space-x-4">
                <button onClick={handleExport} className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-bold flex items-center justify-center shadow-xl shadow-slate-200">
                   <Download size={20} className="mr-3" /> Start Export
                </button>
                <button onClick={() => setShowExportModal(false)} className="px-8 py-5 bg-slate-100 text-slate-500 rounded-2xl font-bold">Cancel</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatCard({ title, value, sub, icon, trend }) {
  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 group">
      <div className="flex justify-between items-start mb-6">
        <div className="p-4 bg-slate-50 rounded-2xl group-hover:bg-emerald-50 transition-colors">{icon}</div>
        <div className={`flex items-center space-x-1 text-xs font-black ${trend > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{Math.abs(trend)}%</span>
        </div>
      </div>
      <div>
        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[2px] mb-2">{title}</h3>
        <p className="text-3xl font-black text-slate-800 tabular-nums leading-none">{value}</p>
        <p className="text-xs text-slate-400 font-bold mt-2 tracking-tight">{sub}</p>
      </div>
    </div>
  );
}

function IngestionItem({ bin, status, data, color }) {
  return (
    <div className="p-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all cursor-default">
      <div className="flex justify-between text-[10px] font-bold tracking-[2px] mb-2 opacity-50 text-white uppercase">
        <span>{bin}</span>
        <span className={color}>{status}</span>
      </div>
      <p className="text-xs text-slate-200 font-medium leading-relaxed">{data}</p>
    </div>
  );
}

function OpCard({ title, desc, action, variant, onClick }) {
  const styles = {
    emerald: "bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700",
    blue: "bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700",
    slate: "bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800"
  };
  
  return (
    <div className="p-8 rounded-[2rem] border border-slate-100 bg-slate-50/30 flex flex-col justify-between group transition-all">
      <div>
        <h3 className="text-lg font-black text-slate-800 mb-3">{title}</h3>
        <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">{desc}</p>
      </div>
      <button onClick={onClick} className={`w-full py-4 rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-95 ${styles[variant]}`}>
        {action}
      </button>
    </div>
  );
}
\n`\n\n---\n\n## Global Styles\n**File:** smart-waste-ui/app/globals.css\n\n`css\n@import "tailwindcss";

@theme {
  --font-sans: "Inter", "system-ui", "-apple-system", sans-serif;
  
  --color-brand-primary: #10b981;
  --color-brand-secondary: #059669;
  --color-brand-accent: #34d399;
  
  --color-bg-main: #f8fafc;
  --color-bg-card: #ffffff;
}

@layer base {
  body {
    @apply bg-bg-main text-slate-900 antialiased;
    font-family: var(--font-sans);
  }
}

@layer utilities {
  .glass-card {
    @apply bg-white/80 backdrop-blur-md border border-white/20 shadow-xl shadow-slate-200/50;
  }
  
  .glass-sidebar {
    @apply bg-slate-50/50 backdrop-blur-lg border-r border-slate-200/50;
  }
  
  .text-gradient {
    @apply bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-500;
  }
  
  .btn-primary {
    @apply bg-brand-primary text-white font-semibold px-6 py-2 rounded-xl 
           hover:bg-brand-secondary transition-all duration-300 shadow-lg shadow-emerald-200
           active:scale-95;
  }

  .stat-card-gradient {
    @apply bg-gradient-to-br from-white to-slate-50;
  }
}

/* Custom Scrollbar for modern look */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  @apply bg-transparent;
}
::-webkit-scrollbar-thumb {
  @apply bg-slate-200 rounded-full hover:bg-slate-300;
}
\n`\n\n---\n\n## Monitoring Page\n**File:** smart-waste-ui/app/monitoring/page.js\n\n`javascript\n"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Battery, Flame, Trash2, Filter, Search, Activity, RefreshCw } from 'lucide-react';

export default function Monitoring() {
  const [bins, setBins] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const fetchBins = async () => {
    try {
      const resp = await fetch('http://localhost:8000/api/bins');
      const data = await resp.json();
      if (data.data) setBins(data.data);
    } catch (e) {
      console.error("Failed to fetch bins.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBins();
    const inv = setInterval(fetchBins, 5000);
    return () => clearInterval(inv);
  }, []);

  const filteredBins = bins.filter(b => {
    if (filter === 'ALL') return true;
    if (filter === 'CRITICAL') return b.status === 'FIRE_ALERT' || b.fill_percentage >= 90;
    if (filter === 'WARNING') return b.status === 'MAINTENANCE' || (b.fill_percentage >= 70 && b.fill_percentage < 90);
    return true;
  });

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Live Network Telemetry</h1>
          <p className="text-slate-400 font-medium mt-1">Real-time status tracking for all deployed ultrasonic bin sensors.</p>
        </div>
        <div className="flex border border-slate-200 bg-white rounded-2xl p-1.5 shadow-sm">
          <FilterButton label="All" active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
          <FilterButton label="Critical" active={filter === 'CRITICAL'} onClick={() => setFilter('CRITICAL')} color="rose" />
          <FilterButton label="Warning" active={filter === 'WARNING'} onClick={() => setFilter('WARNING')} color="amber" />
        </div>
      </header>

      {loading && bins.length === 0 ? (
        <div className="p-20 text-center font-bold text-slate-300 uppercase tracking-widest animate-pulse flex items-center justify-center">
          <RefreshCw className="animate-spin mr-3" /> Establishing Data Stream...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredBins.map(bin => (
              <motion.div 
                key={bin.bin_id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <SensorCard bin={bin} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function FilterButton({ label, active, onClick, color }) {
  const activeStyles = {
    rose: 'bg-rose-600 text-white shadow-lg shadow-rose-200',
    amber: 'bg-amber-500 text-white shadow-lg shadow-amber-200',
    default: 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
  };
  
  return (
    <button 
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${active ? (activeStyles[color] || activeStyles.default) : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  );
}

function SensorCard({ bin }) {
  const isCritical = bin.status === 'FIRE_ALERT' || bin.fill_percentage >= 90;
  
  return (
    <div className={`bg-white p-6 rounded-[2rem] border border-slate-200/60 shadow-sm relative overflow-hidden group transition-all duration-500 ${isCritical ? 'ring-2 ring-rose-300 ring-offset-4 ring-offset-slate-50' : ''}`}>
      {isCritical && (
        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-20 transition-opacity">
          <Flame size={100} className="text-rose-500" />
        </div>
      )}

      <div className="flex justify-between items-start mb-8 relative z-10">
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">{bin.bin_id}</h3>
          <p className="text-[10px] font-black text-slate-300 tracking-tighter">S/N: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${isCritical ? 'bg-rose-50 text-rose-500' : (bin.fill_percentage >= 70 ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-600')}`}>
          {bin.status}
        </div>
      </div>

      <div className="space-y-6 relative z-10">
        <div>
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-bold text-slate-400">Fill Percentage</span>
            <span className={`text-xl font-black ${bin.fill_percentage >= 90 ? 'text-rose-600' : 'text-slate-800'}`}>{bin.fill_percentage}%</span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${bin.fill_percentage}%` }}
              className={`h-full transition-all duration-1000 ${bin.fill_percentage >= 90 ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : (bin.fill_percentage >= 70 ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_4px_10px_rgba(16,185,129,0.3)]')}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl bg-slate-50 ${bin.temperature > 50 ? 'text-rose-500' : 'text-slate-400'}`}><Flame size={18}/></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Temp</p>
              <p className="font-bold text-slate-800">{bin.temperature}°C</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl bg-slate-50 ${bin.battery_status < 20 ? 'text-rose-500' : 'text-slate-400'}`}><Battery size={18}/></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Battery</p>
              <p className="font-bold text-slate-800">{bin.battery_status}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
\n`\n\n---\n\n## Routing & Optimization Page\n**File:** smart-waste-ui/app/optimization/page.js\n\n`javascript\n"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, ArrowRight, RefreshCw, AlertCircle, CheckCircle2, Navigation2, Activity, X } from 'lucide-react';
import dynamic from 'next/dynamic';

const RouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-50 flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-xs rounded-[2.5rem]">Loading Map Engine...</div>
});

export default function Optimization() {
  const [route, setRoute] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchData, setDispatchData] = useState({ driver_name: "", truck_id: "" });
  const [submittingDispatch, setSubmittingDispatch] = useState(false);
  const [showSensitivityModal, setShowSensitivityModal] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.05);

  const handleDispatch = async (e) => {
    e.preventDefault();
    setSubmittingDispatch(true);
    try {
      await fetch('http://localhost:8000/api/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...dispatchData,
          zone: "Dynamic Route",
          shift: "Immediate Deployment",
          status: "On Route"
        })
      });
      setShowDispatchModal(false);
      window.location.href = '/scheduling';
    } catch (e) {
      console.error("Dispatch failed");
    } finally {
      setSubmittingDispatch(false);
    }
  };

  const handleSensitivityUpdate = async (e) => {
    e.preventDefault();
    try {
      await fetch('http://localhost:8000/api/settings/sensitivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity })
      });
      setShowSensitivityModal(false);
      triggerOptimization();
    } catch (e) {}
  };

  const triggerOptimization = async () => {
    setOptimizing(true);
    try {
      const resp = await fetch('http://localhost:8000/api/routes/optimize');
      const data = await resp.json();
      if (data.optimized_route) {
        setRoute(data.optimized_route);
      }
    } catch (e) {
      console.error("Optimization failed.");
    } finally {
      setOptimizing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSensitivity = async () => {
      try {
        const resp = await fetch('http://localhost:8000/api/settings/sensitivity');
        const data = await resp.json();
        if (data.threshold !== undefined) setSensitivity(data.threshold);
      } catch (e) {}
    };
    fetchSensitivity();
    triggerOptimization();
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Dynamic Routing</h1>
          <p className="text-slate-400 font-medium mt-1">Shortest-path generation using the Nearest Neighbor algorithm.</p>
        </div>
        <button 
          onClick={triggerOptimization}
          disabled={optimizing}
          className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center shadow-xl shadow-slate-200 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={20} className={`mr-2 ${optimizing ? 'animate-spin' : ''}`} />
          {optimizing ? 'Recalculating...' : 'Trigger Optimizer'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Route Steps */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[600px] flex flex-col">
            <h2 className="text-xl font-bold text-slate-800 mb-8 flex items-center">
              <Navigation className="mr-3 text-emerald-500" /> Planned Path
            </h2>
            
            <div className="flex-1 space-y-0 relative">
              {/* Central connection line */}
              <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-100 z-0"></div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-300 font-bold uppercase tracking-widest space-y-4">
                  <RefreshCw className="animate-spin" size={32} />
                  <span>Computing Path...</span>
                </div>
              ) : route.length > 0 ? (
                route.map((node, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="relative flex space-x-6 pb-10 last:pb-0 group"
                  >
                    <div className={`w-10 h-10 rounded-full flex-shrink-0 z-10 flex items-center justify-center font-black text-sm transition-all duration-500 ${node.stop === 'DEPOT' ? 'bg-slate-800 text-white' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'}`}>
                      {i === 0 ? "S" : (i === route.length - 1 ? "E" : i)}
                    </div>
                    <div className="pt-1.5 flex-1 p-5 rounded-2xl border border-slate-50 group-hover:border-emerald-100 group-hover:bg-emerald-50/20 transition-all">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">{node.stop}</h4>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{node.reason}</span>
                      </div>
                      <div className="flex items-center space-x-4 mt-3">
                         <div className="flex items-center text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                          <MapPin size={12} className="mr-1 opacity-50" /> {node.lat.toFixed(4)}, {node.lng.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-10 space-y-4">
                  <CheckCircle2 size={48} className="text-emerald-500" />
                  <p className="font-bold text-slate-800">Clear Network</p>
                  <p className="text-sm text-slate-400">All bins are currently below collection thresholds. No route needed.</p>
                </div>
              )}
            </div>

            {route.length > 0 && (
              <button 
                onClick={() => setShowDispatchModal(true)}
                className="w-full mt-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-100 transition-all flex items-center justify-center space-x-2"
              >
                <span>Dispatch to Fleet</span>
                <Navigation2 size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Console / Map Placeholder */}
        <div className="lg:col-span-2 flex flex-col h-full space-y-6">
          <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-slate-50 opacity-40"></div>
            
            <div className="absolute inset-0 z-0">
              <RouteMap route={route} />
            </div>
            
            {route.length > 0 && (
              <div className="absolute top-6 right-6 z-10 bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-xl flex space-x-4 border border-white">
                <Stat label="Total Stops" value={route.length} />
                <Stat label="Est. Drive" value={route.length * 4 + " mins"} />
              </div>
            )}
          </div>
          
          <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex justify-between items-center group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 transform translate-x-10 -translate-y-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-700 opacity-20">
              <Activity size={120} className="text-emerald-500" />
            </div>
            <div className="relative z-10">
              <h4 className="font-bold text-lg mb-1">Algorithm Sensitivity</h4>
              <p className="text-slate-400 text-sm">Nearest Neighbor prioritization active with ΔR threshold of {sensitivity}.</p>
            </div>
            <button 
              onClick={() => setShowSensitivityModal(true)}
              className="relative z-10 px-6 py-3 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-2xl font-bold transition-all flex items-center transform group-hover:scale-105"
            >
              <span>Adjust Sensitivity</span>
              <ArrowRight size={18} className="ml-2" />
            </button>
          </div>
        </div>
      </div>

      {/* Dispatch Modal */}
      <AnimatePresence>
        {showDispatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Dispatch Fleet</h3>
                <button onClick={() => setShowDispatchModal(false)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
              </div>

              <form onSubmit={handleDispatch} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Driver Name</label>
                  <input 
                    value={dispatchData.driver_name}
                    onChange={(e) => setDispatchData({...dispatchData, driver_name: e.target.value})}
                    required
                    placeholder="E.g. Rajesh Kumar"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Truck ID</label>
                  <input 
                    value={dispatchData.truck_id}
                    onChange={(e) => setDispatchData({...dispatchData, truck_id: e.target.value})}
                    required
                    placeholder="E.g. TRK-402"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all font-sans"
                  />
                </div>
                <div className="pt-4 flex space-x-4">
                  <button type="submit" disabled={submittingDispatch} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-500 shadow-xl shadow-emerald-100 flex items-center justify-center">
                    {submittingDispatch && <RefreshCw size={18} className="animate-spin mr-2" />}
                    Deploy Now
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sensitivity Modal */}
      <AnimatePresence>
        {showSensitivityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Algorithm Sensitivity</h3>
                <button onClick={() => setShowSensitivityModal(false)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
              </div>

              <form onSubmit={handleSensitivityUpdate} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">ΔR Threshold</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1.00"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-sans"
                  />
                </div>
                <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 shadow-xl flex items-center justify-center">
                  Save Changes
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-black text-slate-800 mt-1">{value || "0"}</p>
    </div>
  );
}
\n`\n\n---\n\n## RouteMap Component\n**File:** smart-waste-ui/app/optimization/RouteMap.js\n\n`javascript\n"use client";
import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';

function MapUpdater({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  }, [bounds, map]);
  return null;
}

export default function RouteMap({ route }) {
  if (!route || route.length === 0) {
    return (
      <MapContainer center={[30.3160, 78.0300]} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    );
  }

  const positions = route.map(node => [node.lat, node.lng]);

  return (
    <MapContainer center={positions[0]} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {route.map((node, i) => (
        <Marker key={i} position={[node.lat, node.lng]}>
          <Popup>
            <div className="text-center w-32">
              <strong className="block text-slate-800">{node.stop}</strong>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{node.reason}</span>
            </div>
          </Popup>
        </Marker>
      ))}

      <Polyline positions={positions} pathOptions={{ color: '#10b981', weight: 5, dashArray: '10, 10' }} />
      <MapUpdater bounds={positions} />
    </MapContainer>
  );
}
\n`\n\n---\n\n## Analytics Page\n**File:** smart-waste-ui/app/analytics/page.js\n\n`javascript\n"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import { Activity, Battery, Flame, Trash2, Download, Filter } from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AnalyticsDashboard() {
  const [bins, setBins] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [binsResp, alertsResp] = await Promise.all([
          fetch('http://localhost:8000/api/bins'),
          fetch('http://localhost:8000/api/alerts')
        ]);
        const [binsData, alertsData] = await Promise.all([binsResp.json(), alertsResp.json()]);
        if (binsData.data) setBins(binsData.data.sort((a,b) => a.bin_id.localeCompare(b.bin_id)));
        if (alertsData.data) setAlerts(alertsData.data);
      } catch (e) {
        // quiet fail 
      }
    };
    fetchData();
    const inv = setInterval(fetchData, 10000);
    return () => clearInterval(inv);
  }, []);

  const totalBins = bins.length;
  const avgFill = totalBins ? (bins.reduce((acc, bin) => acc + bin.fill_percentage, 0) / totalBins).toFixed(1) + "%" : "0%";
  const fireIncidents = alerts.filter(a => a.type === 'CRITICAL').length;
  const avgBattery = totalBins ? (bins.reduce((acc, bin) => acc + bin.battery_status, 0) / totalBins).toFixed(1) + "%" : "0%";


  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800">System Analytics</h1>
          <p className="text-slate-400 font-medium mt-1">Detailed performance metrics across the Dehradun IoT network.</p>
        </div>
        <div className="flex space-x-3">
          <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            <Filter size={18} />
            <span>Filter</span>
          </button>
          <button 
            onClick={() => window.open('http://localhost:8000/api/reports/export?scope=all', '_blank')}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
          >
            <Download size={18} />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Total Bins" value={totalBins === 0 ? "..." : totalBins} icon={<Trash2 size={22} className="text-emerald-500" />} color="bg-emerald-50" />
        <MetricCard title="Avg Fill Level" value={totalBins === 0 ? "..." : avgFill} icon={<Activity size={22} className="text-blue-500" />} color="bg-blue-50" />
        <MetricCard title="Fire Incidents" value={totalBins === 0 ? "..." : fireIncidents.toString().padStart(2, '0')} icon={<Flame size={22} className="text-rose-500" />} color="bg-rose-50" />
        <MetricCard title="Battery Health" value={totalBins === 0 ? "..." : avgBattery} icon={<Battery size={22} className="text-amber-500" />} color="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Fill Distribution */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6 font-sans">Fill Distribution</h2>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bins}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="bin_id" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} domain={[0, 100]} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '10px' }}
                />
                <Bar dataKey="fill_percentage" name="Fill (%)" radius={[8, 8, 0, 0]}>
                  {bins.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill_percentage >= 80 ? '#ef4444' : COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Temperature Trends */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Thermal Variance</h2>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bins}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="bin_id" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '10px' }}
                />
                <Line type="stepAfter" dataKey="temperature" name="Temp (°C)" stroke="#10b981" strokeWidth={3} dot={{ r: 6, fill: '#10b981', strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MetricCard({ title, value, icon, color }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm flex items-center space-x-5">
      <div className={`w-14 h-14 ${color} rounded-2xl flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">{title}</p>
        <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
      </div>
    </div>
  );
}
\n`\n\n---\n\n## Scheduling Page\n**File:** smart-waste-ui/app/scheduling/page.js\n\n`javascript\n"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, User, Truck, MapPin, Clock, MoreHorizontal, ChevronRight, RefreshCw, CheckCircle2, X } from 'lucide-react';

export default function Scheduling() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    driver_name: "", truck_id: "", zone: "", shift: "06:00 AM - 02:00 PM", status: "Standby"
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchFleet = async () => {
    try {
      const resp = await fetch('http://localhost:8000/api/fleet');
      const data = await resp.json();
      if (data.data) setSchedules(data.data);
    } catch (e) {
      console.error("Fleet fetch failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleet();
  }, []);

  const handleAssign = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('http://localhost:8000/api/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAssignment)
      });
      setShowModal(false);
      fetchFleet();
      setNewAssignment({ driver_name: "", truck_id: "", zone: "", shift: "06:00 AM - 02:00 PM", status: "Standby" });
    } catch (e) {
      alert("Assignment failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Fleet Schedule</h1>
          <p className="text-slate-400 font-medium mt-1">Resource allocation and deployment tracking.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
        >
          <Plus size={20} />
          <span>Assign Route</span>
        </button>
      </header>

      {/* Table Section */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-20 animate-pulse text-slate-300 font-bold uppercase tracking-widest">
            <RefreshCw className="animate-spin mb-4" size={32} />
            Synchronizing Fleet Data...
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resource</th>
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone Details</th>
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shift Window</th>
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {schedules.length > 0 ? schedules.map((s, i) => (
                    <tr key={s.id || i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                            <Truck size={24} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 leading-tight">{s.driver_name}</p>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">{s.truck_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-2 text-slate-600">
                          <MapPin size={16} className="text-slate-300" />
                          <span className="text-sm font-semibold">{s.zone}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-2 text-slate-600">
                          <Clock size={16} className="text-slate-300" />
                          <span className="text-sm font-medium tracking-tight">{s.shift}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <StatusChip status={s.status} />
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button className="p-2 text-slate-300 hover:text-slate-600 hover:bg-white rounded-lg transition-all">
                          <MoreHorizontal size={20} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5" className="px-8 py-20 text-center">
                        <div className="max-w-xs mx-auto space-y-2">
                           <CheckCircle2 size={40} className="mx-auto text-slate-200" />
                           <p className="font-bold text-slate-400 uppercase text-xs tracking-widest">No routes assigned yet</p>
                           <p className="text-xs text-slate-300 leading-relaxed">Start by clicking 'Assign Route' to deploy your first collection truck.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-auto bg-slate-50 p-6 border-t border-slate-100 flex justify-between items-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Persistent Archive · v2.1.0</p>
              <div className="flex space-x-2">
                <button 
                  onClick={() => window.open('http://localhost:8000/api/reports/export?scope=all', '_blank')}
                  className="px-5 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all font-sans"
                >
                  Export Archive
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Assignment Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Assign New Fleet Route</h3>
                <button onClick={() => setShowModal(false)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
              </div>

              <form onSubmit={handleAssign} className="p-8 space-y-6">
                <Input label="Driver Name" value={newAssignment.driver_name} onChange={(v) => setNewAssignment({...newAssignment, driver_name: v})} required />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Truck ID" value={newAssignment.truck_id} onChange={(v) => setNewAssignment({...newAssignment, truck_id: v})} required />
                  <Input label="Collection Zone" value={newAssignment.zone} onChange={(v) => setNewAssignment({...newAssignment, zone: v})} required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Shift Window</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50"
                    value={newAssignment.shift}
                    onChange={(e) => setNewAssignment({...newAssignment, shift: e.target.value})}
                  >
                    <option>06:00 AM - 02:00 PM</option>
                    <option>02:00 PM - 10:00 PM</option>
                    <option>10:00 PM - 06:00 AM</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Initial Status</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50"
                      value={newAssignment.status}
                      onChange={(e) => setNewAssignment({...newAssignment, status: e.target.value})}
                    >
                      <option>Standby</option>
                      <option>On Route</option>
                      <option>Completed</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex space-x-4">
                  <button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-500 shadow-xl shadow-emerald-100 flex items-center justify-center">
                    {submitting && <RefreshCw size={18} className="animate-spin mr-2" />}
                    Deploy Now
                  </button>
                  <button type="button" onClick={() => setShowModal(false)} className="bg-slate-50 text-slate-500 py-4 px-8 rounded-2xl font-bold hover:bg-slate-100">Cancel</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Input({ label, value, onChange, required }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</label>
      <input 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={label}
        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all"
      />
    </div>
  );
}

function StatusChip({ status }) {
  const styles = {
    'On Route': 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    'Standby': 'bg-amber-50 text-amber-600 ring-amber-100',
    'Completed': 'bg-blue-50 text-blue-600 ring-blue-100',
  };
  return (
    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${styles[status] || styles.Standby}`}>
      {status || 'Standby'}
    </span>
  );
}
\n`\n\n---\n\n## Settings Page\n**File:** smart-waste-ui/app/settings/page.js\n\n`javascript\n"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Bell, Shield, Save, RefreshCw, Server, AlertCircle, Info } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    thresholds: { fill_critical: 80, temp_critical: 75, battery_warning: 20 },
    system_info: { sector: "Loading...", admin: "Loading...", version: "1.0.0" }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const resp = await fetch('http://localhost:8000/api/settings');
        const data = await resp.json();
        if (data) setSettings(data);
      } catch (e) {
        console.error("Failed to load settings.");
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleUpdate = async (key, value) => {
    setSaving(true);
    try {
      await fetch(`http://localhost:8000/api/settings/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (e) {
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-20 animate-pulse text-slate-400 font-bold uppercase tracking-widest">
      <RefreshCw className="animate-spin mr-3" /> Syncing Configurations...
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-4xl space-y-8"
    >
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800">System Settings</h1>
          <p className="text-slate-400 font-medium mt-1">Configure global IoT thresholds and administrative metadata.</p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center ${saving ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
          {saving && <RefreshCw size={14} className="animate-spin mr-2" />}
          {saving ? 'Saving...' : 'All synced'}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Thresholds Section */}
        <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-rose-50 text-rose-500 rounded-lg"><Bell size={20}/></div>
            <h2 className="text-xl font-bold text-slate-800">Alert Thresholds</h2>
          </div>
          
          <div className="space-y-4">
            <SettingInput 
              label="Critical Fill Level (%)" 
              value={settings.thresholds.fill_critical} 
              onChange={(v) => handleUpdate('thresholds', {...settings.thresholds, fill_critical: parseInt(v)})} 
            />
            <SettingInput 
              label="Critical Temperature (°C)" 
              value={settings.thresholds.temp_critical} 
              onChange={(v) => handleUpdate('thresholds', {...settings.thresholds, temp_critical: parseInt(v)})} 
            />
            <SettingInput 
              label="Battery Warning (%)" 
              value={settings.thresholds.battery_warning} 
              onChange={(v) => handleUpdate('thresholds', {...settings.thresholds, battery_warning: parseInt(v)})} 
            />
          </div>
        </section>

        {/* System Info Section */}
        <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Server size={20}/></div>
            <h2 className="text-xl font-bold text-slate-800">Metadata</h2>
          </div>
          
          <div className="space-y-4">
            <SettingInput 
              label="Sector Location" 
              value={settings.system_info.sector} 
              onChange={(v) => handleUpdate('system_info', {...settings.system_info, sector: v})} 
            />
            <SettingInput 
              label="Admin Name" 
              value={settings.system_info.admin} 
              onChange={(v) => handleUpdate('system_info', {...settings.system_info, admin: v})} 
            />
            <SettingInput 
              label="System Version" 
              value={settings.system_info.version} 
              onChange={(v) => handleUpdate('system_info', {...settings.system_info, version: v})} 
              disabled
            />
          </div>
        </section>
      </div>

      <div className="bg-slate-900 p-8 rounded-3xl flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-white/10 text-white rounded-2xl"><Shield size={24}/></div>
          <div>
            <h3 className="text-white font-bold">Persistence Layer</h3>
            <p className="text-slate-400 text-sm">Changes are applied immediately across all IoT listeners.</p>
          </div>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all flex items-center"
        >
          <RefreshCw size={18} className="mr-2" /> Force Global Refresh
        </button>
      </div>
    </motion.div>
  );
}

function SettingInput({ label, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</label>
      <input 
        type={typeof value === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      />
    </div>
  );
}
\n`\n\n---\n\n