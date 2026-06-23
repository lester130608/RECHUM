-- Migration 0002: Add ADP fields to employees table
-- Date: March 2, 2026

-- ===============================================
-- ADD ADP IDENTIFIER FIELDS TO EMPLOYEES TABLE
-- ===============================================

-- Add ADP worker identifier fields if they don't exist
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS adp_worker_id text,
ADD COLUMN IF NOT EXISTS file_number text,
ADD COLUMN IF NOT EXISTS full_name text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;

-- Create index for ADP lookups
CREATE INDEX IF NOT EXISTS idx_employees_adp_worker_id ON employees(adp_worker_id);
CREATE INDEX IF NOT EXISTS idx_employees_file_number ON employees(file_number);
CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees(full_name);

-- Add constraint to ensure one of the ADP identifiers exists for payroll-ready employees
-- (This will be enforced in the application logic as well)

-- Update any existing employees to have a temporary file_number if needed
-- (This is optional - can be done through the UI)

-- ===============================================
-- VERIFY EMPLOYEES TABLE STRUCTURE
-- ===============================================

-- Check current employees table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'employees' 
AND table_schema = 'public'
ORDER BY ordinal_position;
