-- Migration: Add ADP fields to employees table
-- Run this in Supabase SQL Editor after the main migration
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

-- ===============================================
-- PROFILES TABLE CHECK
-- ===============================================

-- Verify that profiles table exists for RLS policies
-- If it doesn't exist, you may need to adapt the RLS policies
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'profiles' 
AND table_schema = 'public';

-- If profiles table doesn't exist, you can either:
-- 1. Create it with role field, or
-- 2. Adapt RLS policies to use auth.users metadata or another role system

-- Example profiles table structure (run only if needed):
/*
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
*/