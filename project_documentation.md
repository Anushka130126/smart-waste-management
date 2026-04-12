# Project Documentation: EcoRoute Pro (Smart Waste Management System)

## Part 1: Software Requirements Specification (SRS)
*Prepared in accordance with IEEE Std 830-1998 capabilities.*

### 1. Introduction
#### 1.1 Purpose
The purpose of this document is to define the functional and non-functional requirements for the EcoRoute Pro Smart Waste Management System. It outlines the interactions between the IoT telemetry hardware, the cloud-based application server, and the administrative dashboard.

#### 1.2 Scope
EcoRoute Pro is an IoT-based web platform designed to facilitate dynamic, data-driven waste collection. Instead of relying on static daily schedules, the system aggregates real-time telemetry (fill percentage, internal temperature) from municipal waste receptacles. Planners utilize this data to generate shortest-path collection routes via the Nearest Neighbor algorithm and dispatch fleet resources accordingly. 

#### 1.3 Definitions, Acronyms, and Abbreviations
*   **IoT (Internet of Things):** The network of physical waste bins equipped with sensors.
*   **MQTT:** Message Queuing Telemetry Transport, a lightweight messaging protocol used for telemetry.
*   **API:** Application Programming Interface (FastAPI implementation).
*   **RLS:** Row Level Security (Supabase security methodology).

### 2. Overall Description
#### 2.1 Product Perspective
EcoRoute is a distributed client-server application. It comprises three main tiers:
1.  **Hardware Layer (Simulated):** IoT devices publishing JSON packet telemetry via Mosquitto MQTT broker.
2.  **Logic & Storage Layer (Backend):** A Python FastAPI server handling data validation, route calculation, and persisting data to a Supabase PostgreSQL cluster.
3.  **Presentation Layer (Frontend):** A Next.js (React) application serving as the GUI for dispatchers, utilizing Tailwind CSS for styling and Recharts for live data visualization.

#### 2.2 Product Functions
*   **Smart Bin Monitoring:** Continuous polling and ingestion of bin capacities and thermal states.
*   **Live Analytics:** Real-time data visualization of systemic Fill Distribution and Thermal Variances.
*   **Route Optimization:** Dynamic calculation of geospatial paths linking critical nodes using the Nearest Neighbor heuristic.
*   **Fleet Management:** A scheduling hub to assign drivers to algorithmic routes and track operational status.
*   **Audit Reporting:** Bulk extraction of historical telemetry and schedule alignments into CSV architecture.

#### 2.3 User Characteristics
The primary end-users are Municipal Dispatchers and Logistics Managers. Users are expected to have basic technical literacy for web dashboard operations but do not require engineering backgrounds.

#### 2.4 Operating Environment
*   **Frontend End-User:** Modern Web Browser (Chrome, Firefox, Safari).
*   **Server End:** Node.js (v18+) for Next.js web application, Python (3.9+) for FastAPI backend.
*   **Database:** Supabase Cloud (PostgreSQL 15+).

### 3. Specific Requirements
#### 3.1 Functional Requirements
*   **FR-01 (Data Ingestion):** The system shall subscribe to the `city/smartbins/data` MQTT topic and natively upsert incoming telemetry to the `smart_bins` table.
*   **FR-02 (Threshold Alerting):** The system shall autonomously log a `CRITICAL` or `WARNING` event into the `alerts` table if bin threshold > 80% or temperature indicates a fire `FIRE_ALERT`.
*   **FR-03 (Routing Engine):** The system shall process nodes flagged with `needs_collection = true` to compute a sequential route utilizing the shortest point-to-point physical distance.
*   **FR-04 (Fleet DB Mapping):** Dispatch actions must log the `driver_name`, `truck_id`, and exact deployment stamp to the `fleet_schedule` relational table.

#### 3.2 Non-Functional Requirements
*   **Performance:** The GUI should display real-time sensor updates within 5 seconds of the dispatch ping. The routing engine must solve node computations in under 2 seconds.
*   **Security:** Database connections must occur strictly over HTTPS/WSS. Direct SQL interactions are governed by Supabase Row Level Security protocols.
*   **Reliability:** The Notification Poller must gracefully fail (silently) and attempt automated reconnection if backend availability drops.

***

## Part 2: Test Cases

### TC-01: Real-Time Telemetry Ingestion
*   **Description:** Verify that active hardware telemetry accurately registers in the DB and UI.
*   **Pre-conditions:** Python `iot_simulator.py` script is running and connected to MQTT. FastAPI is online.
*   **Test Steps:** 
    1. Monitor terminal output until Simulator fires an update for `BIN_001`.
    2. Navigate to Dashboard -> Live Monitoring.
    3. Check `BIN_001` statistics.
*   **Expected Result:** The exact Temp and Fill values from the terminal successfully render in the Web GUI without manual page refresh.

### TC-02: Critical Fire Alert Notification
*   **Description:** Verify the system detects and bubbles critical anomalies up to the dispatcher.
*   **Pre-conditions:** System is running.
*   **Test Steps:**
    1. Wait for simulator to trigger an anomaly state `FIRE_ALERT`.
    2. Observe the Notification Bell in the top right of the dashboard.
    3. Click the bell to open the drawer.
*   **Expected Result:** The bell shows a red notification counting integer. The drawer explicitly identifies the bin experiencing the anomaly with a timestamp.

### TC-03: Nearest-Neighbor Active Computation
*   **Description:** Assure algorithmic routing accurately filters and connects applicable nodes.
*   **Pre-conditions:** At least 2 bins must possess a fill rate >= 80% or a Critical Status.
*   **Test Steps:**
    1. Navigate to the **Dynamic Routing** page.
    2. Observe the generated list and the drawn Leaflet Map polyline.
*   **Expected Result:** The map routes exclusively from the Depot -> Applicable Bin A -> Applicable Bin B -> Return. Empty bins (<80%) must be entirely bypassed by the algorithm. 

### TC-04: Fleet Dispatch Execution
*   **Description:** Assure dispatch assignments write correctly to the database.
*   **Pre-conditions:** Dynamic route is successfully available. 
*   **Test Steps:**
    1. Click "Dispatch to Fleet" on the routing page.
    2. Input "Driver X" and "TRK-001" and submit.
    3. Observe redirection to Fleet Schedule.
*   **Expected Result:** The popup closes, table redirects, and "Driver X" physically appears in the Fleet Table mapped to "On Route".

### TC-05: Archival Exporting
*   **Description:** Test the CSV generation engine.
*   **Pre-conditions:** Supabase `smart_bins` table contains at least 1 entry.
*   **Test Steps:**
    1. Click "Generate Report".
    2. Select "All-Time Database Dump".
    3. Open the downloaded `.csv` file.
*   **Expected Result:** A clean CSV parses containing correct headers (`bin_id`, `fill_percentage`, `temperature`, `status`) and data rows.

***

## Part 3: Maintenance Plan

### 1. Routine System Maintenance
*   **Database Pruning (Quarterly):** As telemetry arrays ingest millions of rows, legacy `smart_bins` data should be archived. Administrators must connect to Supabase SQL editor utilizing `admin_tools.sql` to truncate deprecated alert logs and fleet history older than 90 days.
*   **Library Audits (Biannually):** React dependencies (`framer-motion`, `recharts`, `leaflet`) and Python dependencies (`fastapi`, `paho-mqtt`) must be updated via `npm audit` and `pip list --outdated` to patch zero-day vulnerabilities.

### 2. Live Monitoring & Health
*   **MQTT Stability:** The core vulnerability resides in the `test.mosquitto.org` broker failing under load. If telemetry halts, the maintenance dev should reroute `MQTT_BROKER` in the `.env` payload to an internal, dedicated Mosquitto/HiveMQ server.
*   **API Integrity Checks:** FastAPI provides a direct health check at `GET /`. Uptime monitoring applications (e.g. BetterStack) should be configured to ping this address every 60 seconds to ensure the server thread hasn’t crashed.

### 3. Scaling Path
*   **Node Upgrades:** Should the city sector expand beyond 1,000 bins, the simple Nearest Neighbor routing script within `main.py` will reach $O(n^2)$ computational stress. The maintenance plan dictates migrating the routing function from Python logic to an external C-optimized matrix library (e.g., Google OR-Tools) or utilizing Mapbox Directions API for traffic-aware routing.
*   **Database Tier:** Migrate off the Supabase free tier to accommodate data storage exceeding 500MB if granular historical queries become necessary.

### 4. Disaster Recovery
*   **Database Backups:** Ensure Supabase Point-in-Time Recovery (PITR) is toggled ON to allow rollbacks in the event of accidental table deletion.
*   **Git Deployment:** All production pushes must occur within the `main` GitHub branch mapped sequentially to Render endpoints. In the event of catastrophic server failure, spinning up an identically configured clone takes <3 minutes via Render webhooks.
