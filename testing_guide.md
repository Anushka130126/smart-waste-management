# Smart Waste Management System - Ultimate Testing Guide

This guide will help you verify the bug fix, explore the new professional UI, and test the AI-driven route optimization.

---

## 🏗️ Phase 1: Preparation

### 1. Fix the Supabase Permission Bug
The MQTT error (42501) was caused by Supabase blocking updates from the backend "anon" key.
1.  Open your **Supabase Dashboard**.
2.  Go to the **SQL Editor** and create a **New Query**.
3.  Copy and run the code from [fix_rls.sql](./fix_rls.sql).

### 2. Install Project Dependencies
Ensure all libraries are installed:
```powershell
# In the root folder
pip install -r requirements.txt

# In the smart-waste-ui folder
cd smart-waste-ui
npm install
cd ..
```

---

## 🚀 Phase 2: Running the System

To see the system in action, you need three separate terminals running:

### Terminal A: The Backend (FastAPI)
```powershell
# In the root folder
python main.py
```
*Look for: "MQTT Background Listener Started..."*

### Terminal B: The Simulator (IoT Data)
```powershell
# In the root folder
python iot_simulator.py
```
*Look for: "Published: BIN_001 | Fill: 25% | Status: ACTIVE"*

### Terminal C: The Frontend (UI)
```powershell
# In the smart-waste-ui folder
npm run dev
```
*Look for: Dashboard available at http://localhost:3000*

---

## 🧪 Phase 3: Testing Interactivity

Now that everything is running, visit **http://localhost:3000** and test the following:

1.  **Live Ingestion Feed**: Find the dark box on the right. You should see real-time log entries appearing as the `iot_simulator.py` sends data.
2.  **Demo Mode Toggle**: In the top control bar, click **"Live Mode"**. It will switch to **"Demo Mode Active"**, populating the charts with high-resolution sample data for previewing.
3.  **Force Route Recalculation**: 
    - Click **"Recalculate Now"** in the Operations Hub.
    - A detailed modal will appear showing the optimized stops (e.g., Depot -> BIN_003 -> BIN_042).
    - If you are in **Live Mode**, it will use real data from your database. If you are in **Demo Mode**, it will show a simulated high-priority route.
4.  **Mock Actions**: Click **"Open Dispatch"** or **"Download Report"** to see the system confirmation alerts.

---

## 🛠️ Troubleshooting
- **API Error?** Make sure `main.py` is running on port 8000.
- **Charts Empty?** Ensure you have `framer-motion` and `recharts` installed via `npm install`.
- **Still see RLS Error?** Double-check that you ran the SQL in Supabase and that your `.env` contains the correct `SUPABASE_KEY`.
