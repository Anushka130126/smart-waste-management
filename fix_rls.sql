-- Enable the 'anon' role to insert/update data in the smart_bins table
-- This resolves the 42501 Row-Level Security policy error for the MQTT listener

ALTER TABLE smart_bins ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users (like our backend using the anon key) to select data
DROP POLICY IF EXISTS "Allow anon select" ON smart_bins;
CREATE POLICY "Allow anon select" ON smart_bins
FOR SELECT USING (true);

-- Allow anonymous users to insert/update (upsert) data
-- NOTE: In a production environment, you should use the service_role key instead of allowing anon upsert.
DROP POLICY IF EXISTS "Allow anon upsert" ON smart_bins;
CREATE POLICY "Allow anon upsert" ON smart_bins
FOR ALL
TO anon
USING (true)
WITH CHECK (true);
