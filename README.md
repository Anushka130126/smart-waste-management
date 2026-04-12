# EcoRoute IoT: Smart Waste Management System

## 🌍 Project Overview
EcoRoute IoT is a modern, end-to-end Smart Waste Management solution designed to optimize urban waste collection using IoT sensors, real-time data ingestion, and AI-driven route optimization.

The goal of the system is to reduce operational costs, fuel consumption, and environmental impact by ensuring that waste collection only happens when and where it is needed.

---

## 🏗️ Technical Architecture

### 1. IoT Simulation (`iot_simulator.py`)
- Simulates a network of "Smart Bins" equipped with ultrasonic fill-level sensors, temperature sensors, and battery monitors.
- Reports data via **MQTT** (Message Queuing Telemetry Transport) to a central broker (`test.mosquitto.org`).

### 2. Backend & Listener (`main.py`)
- **FastAPI** server that acts as the brain of the system.
- **Background MQTT Listener**: Continuously monitors the MQTT broker for incoming bin data.
- **Database (Supabase)**: Stores telemetry data for all bins.
- **Route Optimizer**: Implements a "Nearest Neighbor" algorithm to calculate the most efficient path for collection trucks, prioritizing bins that are full (>80%) or reporting alerts (e.g., Fire).

### 3. Frontend Dashboard (`smart-waste-ui`)
- A **Next.js 16** application with a premium "Glassmorphism" design.
- **Live Ingestion**: Real-time log of data being processed by the system.
- **Analytics**: Visualizes historical trends and thermal variance across the network.
- **Operations Hub**: Allows admins to trigger route recalculations, dispatch fleets, and export data.

---

## 🚀 Key Features
- **Real-time Fire Alerts**: Immediate notification if a bin's internal temperature exceeds safety thresholds.
- **Predictive Optimization**: Routes are calculated dynamically based on current sensor data.
- **Eco-Mode**: Reduces truck deployments by filtering out bins with low fill levels.
- **Demo Mode**: Allows exploring the UI features even without active IoT hardware or backend connectivity.

---

## 🛠️ Tech Stack
- **Frontend**: Next.js 16, React 19, Tailwind 4, Framer Motion, Recharts, Lucide Icons.
- **Backend**: FastAPI (Python), Paho-MQTT, Supabase (PostgreSQL).
- **Communication**: MQTT (IoT) and REST (Web).

---

## 🏃 Getting Started (Running Locally)

To share and run this project locally, ensure you have **Node.js** (for Next.js) and **Python 3.8+** installed.

### 1. Database Setup
1. Create a free account on [Supabase](https://supabase.com).
2. Create a new project.
3. Run the setup and RLS fix scripts located in the project root (`setup_database_v2.sql` and `fix_rls.sql`) inside your Supabase SQL Editor.
4. Go to Project Settings -> API and copy your `URL` and `anon key`.

### 2. Backend & IoT Setup
Navigate to the root folder of the project (`smart_waste_project`).
1. Create your environment file by duplicating `.env.example`:
   `cp .env.example .env`
2. Update `.env` with your Supabase credentials:
   ```env
   SUPABASE_URL="https://your-project.supabase.co"
   SUPABASE_KEY="your-anon-or-service-role-key"
   MQTT_BROKER="test.mosquitto.org"
   MQTT_PORT=1883
   ```
3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the backend server (which also automatically manages MQTT listeners):
   ```bash
   python main.py
   ```
5. In a separate terminal, to generate live data, start the IoT Simulator:
   ```bash
   python iot_simulator.py
   ```

### 3. Frontend Dashboard Setup
Open a new terminal and navigate to the frontend directory.
```bash
cd smart-waste-ui
npm install
npm run dev
```
The application will be accessible at `http://localhost:3000`.

---

