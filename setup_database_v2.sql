-- EcoRoute IoT: Database Expansion Script (Phase 2)
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
