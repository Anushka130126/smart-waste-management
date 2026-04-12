-- 1. Fix the RLS Policy for 'alerts' so the backend can correctly update the 'is_read' status!
DROP POLICY IF EXISTS "Anon Update Alerts" ON alerts;
CREATE POLICY "Anon Update Alerts" ON alerts FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 2. Clear out all legacy data without dropping the tables!
-- Select the lines below and run them to clear the old logs and alerts.
DELETE FROM smart_bins;
DELETE FROM alerts;
DELETE FROM fleet_schedule;
