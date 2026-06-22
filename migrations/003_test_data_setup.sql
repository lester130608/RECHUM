-- Test Data Setup for Payroll V2
-- Run this AFTER running the main migrations
-- Date: March 2, 2026

-- ===============================================
-- 1. CREATE PROFILES TABLE (if it doesn't exist)
-- ===============================================

-- Create profiles table for RLS policies
CREATE TABLE IF NOT EXISTS profiles (
    id uuid REFERENCES auth.users(id) PRIMARY KEY,
    email text,
    role text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'supervisor', 'ba', 'admin')),
    first_name text,
    last_name text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Basic profile policies
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE USING (auth.uid() = id);

-- ===============================================
-- 2. ADD TEST EMPLOYEES WITH ADP IDs
-- ===============================================

-- Add ADP fields to employees if they don't exist
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS adp_worker_id text,
ADD COLUMN IF NOT EXISTS file_number text,
ADD COLUMN IF NOT EXISTS full_name text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;

-- Insert test employees (only if they don't exist)
INSERT INTO employees (first_name, last_name, email, adp_worker_id, rate, role, employment_type, status)
SELECT * FROM (VALUES
    ('John', 'Doe', 'john.doe@test.com', 'ADP001', 25.00, 'RBT', 'W-2', 'active'),
    ('Jane', 'Smith', 'jane.smith@test.com', 'ADP002', 30.00, 'BCABA', 'W-2', 'active'),
    ('Mike', 'Johnson', 'mike.johnson@test.com', 'ADP003', 35.00, 'BCBA', 'W-2', 'active'),
    ('Sarah', 'Wilson', 'sarah.wilson@test.com', 'ADP004', 28.00, 'TCM', 'W-2', 'active'),
    ('David', 'Brown', 'david.brown@test.com', 'ADP005', 32.00, 'CLINICIANS', 'W-2', 'active'),
    ('Lisa', 'Garcia', 'lisa.garcia@test.com', 'ADP006', 27.00, 'CMHC', 'W-2', 'active')
) AS t(first_name, last_name, email, adp_worker_id, rate, role, employment_type, status)
WHERE NOT EXISTS (
    SELECT 1 FROM employees WHERE email = t.email
);

-- ===============================================
-- 3. CREATE TEST RATE CARDS
-- ===============================================

-- Insert test rate cards for different departments and service codes
INSERT INTO rate_cards (department, service_code, pay_method, rate, effective_from, active)
SELECT * FROM (VALUES
    -- BA Department
    ('BA', 'REG', 'hourly', 25.00, '2026-01-01', true),
    ('BA', 'OT', 'hourly', 37.50, '2026-01-01', true),
    ('BA', 'ASSESS', 'per_unit', 150.00, '2026-01-01', true),
    ('BA', 'LEAD', 'hourly', 35.00, '2026-01-01', true),
    ('BA', 'TRAINING', 'hourly', 30.00, '2026-01-01', true),
    
    -- TCM Department
    ('TCM', 'REG', 'hourly', 28.00, '2026-01-01', true),
    ('TCM', 'ASSESS', 'per_unit', 125.00, '2026-01-01', true),
    ('TCM', 'INTAKE', 'per_unit', 100.00, '2026-01-01', true),
    ('TCM', 'ADMIN', 'hourly', 25.00, '2026-01-01', true),
    
    -- CMHC Department
    ('CMHC', 'REG', 'hourly', 32.00, '2026-01-01', true),
    ('CMHC', 'OT', 'hourly', 48.00, '2026-01-01', true),
    ('CMHC', 'ASSESS', 'per_unit', 200.00, '2026-01-01', true),
    ('CMHC', 'THERAPY', 'hourly', 40.00, '2026-01-01', true),
    
    -- PSYQ Department
    ('PSYQ', 'REG', 'hourly', 45.00, '2026-01-01', true),
    ('PSYQ', 'ASSESS', 'per_unit', 300.00, '2026-01-01', true),
    ('PSYQ', 'CONSULT', 'hourly', 50.00, '2026-01-01', true),
    
    -- Universal codes
    ('BA', 'BONUS', 'flat', 100.00, '2026-01-01', true),
    ('TCM', 'BONUS', 'flat', 100.00, '2026-01-01', true),
    ('CMHC', 'BONUS', 'flat', 100.00, '2026-01-01', true),
    ('PSYQ', 'BONUS', 'flat', 100.00, '2026-01-01', true)
) AS t(department, service_code, pay_method, rate, effective_from, active)
WHERE NOT EXISTS (
    SELECT 1 FROM rate_cards 
    WHERE department = t.department 
    AND service_code = t.service_code 
    AND active = true
);

-- ===============================================
-- 4. CREATE TEST PROFILE FOR ADMIN ACCESS
-- ===============================================

-- Note: You'll need to create a user in Supabase Auth first, then run this
-- with the actual user ID from auth.users

-- Example (replace with actual user ID):
-- INSERT INTO profiles (id, email, role, first_name, last_name)
-- VALUES (
--     'your-user-id-here',
--     'admin@test.com',
--     'admin',
--     'Test',
--     'Admin'
-- ) ON CONFLICT (id) DO UPDATE SET
--     role = EXCLUDED.role,
--     first_name = EXCLUDED.first_name,
--     last_name = EXCLUDED.last_name;

-- ===============================================
-- 5. VERIFICATION QUERIES
-- ===============================================

-- Check employees with ADP IDs
SELECT 
    id,
    first_name,
    last_name,
    email,
    adp_worker_id,
    role,
    status
FROM employees 
WHERE status = 'active'
ORDER BY first_name;

-- Check rate cards by department
SELECT 
    department,
    service_code,
    pay_method,
    rate,
    active
FROM rate_cards 
WHERE active = true
ORDER BY department, service_code;

-- Check if tables exist
SELECT 
    schemaname,
    tablename,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE tablename IN ('pay_runs', 'payroll_inputs', 'pay_run_items', 'pay_lines', 'rate_cards', 'audit_logs')
ORDER BY tablename;

-- Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename IN ('pay_runs', 'payroll_inputs', 'pay_run_items', 'pay_lines', 'rate_cards', 'audit_logs')
ORDER BY tablename, policyname;