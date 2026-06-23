-- Migration: Create Payroll V2 Database Schema
-- Run this in Supabase SQL Editor
-- Date: March 2, 2026

-- ===============================================
-- 1. CREATE TABLES
-- ===============================================

-- Pay Runs Table
CREATE TABLE pay_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    week_ending date UNIQUE NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review_ready', 'approved', 'exported', 'locked')),
    created_by uuid REFERENCES auth.users(id),
    approved_by uuid REFERENCES auth.users(id),
    approved_at timestamptz,
    exported_at timestamptz,
    locked_at timestamptz,
    notes text,
    calculation_metadata jsonb DEFAULT '{}',
    last_calculated_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Payroll Inputs Table (supervisor submissions)
CREATE TABLE payroll_inputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pay_run_id uuid REFERENCES pay_runs(id) ON DELETE CASCADE NOT NULL,
    department text NOT NULL CHECK (department IN ('BA', 'TCM', 'CMHC', 'PSYQ')),
    submitted_by uuid REFERENCES auth.users(id) NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'validated', 'rejected')),
    submitted_at timestamptz DEFAULT now() NOT NULL
);

-- Pay Run Items Table (one per worker per pay run)
CREATE TABLE pay_run_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pay_run_id uuid REFERENCES pay_runs(id) ON DELETE CASCADE NOT NULL,
    worker_id uuid REFERENCES employees(id) NOT NULL, -- assuming employees table exists
    status text DEFAULT 'draft' CHECK (status IN ('draft', 'needs_fix', 'ready', 'approved', 'locked')),
    calc_total_hours numeric DEFAULT 0,
    calc_total_amount numeric DEFAULT 0,
    exceptions_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(pay_run_id, worker_id)
);

-- Pay Lines Table (individual line items)
CREATE TABLE pay_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pay_run_item_id uuid REFERENCES pay_run_items(id) ON DELETE CASCADE NOT NULL,
    line_type text NOT NULL CHECK (line_type IN ('hours', 'earning', 'adjustment')),
    code text NOT NULL, -- REG, OT, ASSESS, LEAD, INTAKE, etc.
    units numeric,
    hours numeric,
    rate numeric NOT NULL DEFAULT 0,
    amount numeric NOT NULL DEFAULT 0,
    description text,
    metadata jsonb DEFAULT '{}',
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Rate Cards Table (rates by department/service_code/worker)
CREATE TABLE rate_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    department text NOT NULL,
    service_code text NOT NULL,
    pay_method text NOT NULL CHECK (pay_method IN ('hourly', 'per_unit', 'flat')),
    rate numeric NOT NULL,
    worker_id uuid REFERENCES employees(id), -- nullable for general rates
    effective_from date NOT NULL,
    effective_to date,
    active boolean DEFAULT true,
    changed_by uuid REFERENCES auth.users(id),
    change_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Audit Logs Table
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action text NOT NULL,
    before_data jsonb,
    after_data jsonb,
    actor_id uuid REFERENCES auth.users(id) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- ===============================================
-- 2. CREATE INDEXES
-- ===============================================

-- Pay runs indexes
CREATE INDEX idx_pay_runs_week_ending ON pay_runs(week_ending);
CREATE INDEX idx_pay_runs_status ON pay_runs(status);
CREATE INDEX idx_pay_runs_created_by ON pay_runs(created_by);

-- Payroll inputs indexes
CREATE INDEX idx_payroll_inputs_pay_run_dept ON payroll_inputs(pay_run_id, department);
CREATE INDEX idx_payroll_inputs_submitted_by ON payroll_inputs(submitted_by);

-- Pay run items indexes
CREATE INDEX idx_pay_run_items_pay_run_id ON pay_run_items(pay_run_id);
CREATE INDEX idx_pay_run_items_worker_id ON pay_run_items(worker_id);
CREATE INDEX idx_pay_run_items_status ON pay_run_items(status);

-- Pay lines indexes
CREATE INDEX idx_pay_lines_pay_run_item_id ON pay_lines(pay_run_item_id);
CREATE INDEX idx_pay_lines_line_type ON pay_lines(line_type);
CREATE INDEX idx_pay_lines_code ON pay_lines(code);

-- Rate cards indexes
CREATE INDEX idx_rate_cards_lookup ON rate_cards(department, service_code, active, effective_from);
CREATE INDEX idx_rate_cards_worker ON rate_cards(worker_id, active);
CREATE INDEX idx_rate_cards_effective_dates ON rate_cards(effective_from, effective_to);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ===============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ===============================================

ALTER TABLE pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ===============================================
-- 4. CREATE RLS POLICIES
-- ===============================================

CREATE OR REPLACE FUNCTION current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id
    FROM employees
    WHERE user_id = auth.uid()
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_user_has_any_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM employees e
        JOIN user_roles ur ON ur.employee_id = e.id AND ur.active = true
        JOIN roles r ON r.id = ur.role_id
        WHERE e.user_id = auth.uid()
            AND (
                lower(r.code) = ANY(allowed_roles)
                OR lower(r.name) = ANY(allowed_roles)
            )
    );
$$;

-- PAY_RUNS policies
CREATE POLICY "Payroll roles can view pay runs" ON pay_runs
FOR SELECT USING (
    current_user_has_any_role(ARRAY['owner', 'admin', 'hr', 'supervisor', 'ba'])
);

CREATE POLICY "Owner admin can create pay runs" ON pay_runs
FOR INSERT WITH CHECK (
    current_user_has_any_role(ARRAY['owner', 'admin'])
);

CREATE POLICY "Owner admin can update pay runs" ON pay_runs
FOR UPDATE USING (
    current_user_has_any_role(ARRAY['owner', 'admin'])
    AND status != 'locked'
) WITH CHECK (
    current_user_has_any_role(ARRAY['owner', 'admin'])
    AND status != 'locked'
);

-- PAYROLL_INPUTS policies
CREATE POLICY "Allowed roles can insert own payroll inputs" ON payroll_inputs
FOR INSERT WITH CHECK (
    submitted_by = auth.uid()
    AND current_user_has_any_role(ARRAY['owner', 'admin', 'supervisor', 'ba'])
);

CREATE POLICY "Users can view own inputs or privileged roles" ON payroll_inputs
FOR SELECT USING (
    submitted_by = auth.uid()
    OR current_user_has_any_role(ARRAY['owner', 'admin', 'hr'])
);

-- PAY_RUN_ITEMS policies
CREATE POLICY "Privileged roles can view pay run items" ON pay_run_items
FOR SELECT USING (
    current_user_has_any_role(ARRAY['owner', 'admin', 'hr'])
);

CREATE POLICY "Owner admin can manage pay run items" ON pay_run_items
FOR ALL USING (
    current_user_has_any_role(ARRAY['owner', 'admin'])
    AND NOT EXISTS (
        SELECT 1 FROM pay_runs
        WHERE pay_runs.id = pay_run_id
            AND status = 'locked'
    )
) WITH CHECK (
    current_user_has_any_role(ARRAY['owner', 'admin'])
    AND NOT EXISTS (
        SELECT 1 FROM pay_runs
        WHERE pay_runs.id = pay_run_id
            AND status = 'locked'
    )
);

-- PAY_LINES policies
CREATE POLICY "Privileged roles can view pay lines" ON pay_lines
FOR SELECT USING (
    current_user_has_any_role(ARRAY['owner', 'admin', 'hr'])
);

CREATE POLICY "Owner admin can manage pay lines" ON pay_lines
FOR ALL USING (
    current_user_has_any_role(ARRAY['owner', 'admin'])
    AND NOT EXISTS (
        SELECT 1
        FROM pay_runs pr
        JOIN pay_run_items pri ON pr.id = pri.pay_run_id
        WHERE pri.id = pay_run_item_id
            AND pr.status = 'locked'
    )
) WITH CHECK (
    current_user_has_any_role(ARRAY['owner', 'admin'])
    AND NOT EXISTS (
        SELECT 1
        FROM pay_runs pr
        JOIN pay_run_items pri ON pr.id = pri.pay_run_id
        WHERE pri.id = pay_run_item_id
            AND pr.status = 'locked'
    )
);

-- RATE_CARDS policies
CREATE POLICY "Authenticated users can view active rate cards" ON rate_cards
FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND active = true
);

CREATE POLICY "Owner admin can manage rate cards" ON rate_cards
FOR ALL USING (
    current_user_has_any_role(ARRAY['owner', 'admin'])
) WITH CHECK (
    current_user_has_any_role(ARRAY['owner', 'admin'])
);

-- AUDIT_LOGS policies
CREATE POLICY "Owner admin can view audit logs" ON audit_logs
FOR SELECT USING (
    current_user_has_any_role(ARRAY['owner', 'admin'])
);

CREATE POLICY "Authenticated users can insert own audit logs" ON audit_logs
FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND actor_id = auth.uid()
);

-- ===============================================
-- 5. CREATE TRIGGERS & FUNCTIONS
-- ===============================================

-- Function to prevent updates on locked pay runs
CREATE OR REPLACE FUNCTION check_pay_run_locked()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pay_runs 
        WHERE id = NEW.pay_run_id 
        AND status = 'locked'
    ) THEN
        RAISE EXCEPTION 'Cannot modify data for locked pay run';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to prevent modifications on locked runs
CREATE TRIGGER prevent_locked_payroll_inputs
    BEFORE INSERT OR UPDATE OR DELETE ON payroll_inputs
    FOR EACH ROW EXECUTE FUNCTION check_pay_run_locked();

CREATE TRIGGER prevent_locked_pay_run_items
    BEFORE INSERT OR UPDATE OR DELETE ON pay_run_items
    FOR EACH ROW EXECUTE FUNCTION check_pay_run_locked();

-- Function for pay lines (needs to check through pay_run_items)
CREATE OR REPLACE FUNCTION check_pay_line_locked()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pay_runs pr
        JOIN pay_run_items pri ON pr.id = pri.pay_run_id
        WHERE pri.id = NEW.pay_run_item_id 
        AND pr.status = 'locked'
    ) THEN
        RAISE EXCEPTION 'Cannot modify pay lines for locked pay run';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_locked_pay_lines
    BEFORE INSERT OR UPDATE OR DELETE ON pay_lines
    FOR EACH ROW EXECUTE FUNCTION check_pay_line_locked();

-- ===============================================
-- 6. ADD MISSING FIELDS TO EMPLOYEES (if needed)
-- ===============================================

-- Add ADP identifier if it doesn't exist
-- ALTER TABLE employees ADD COLUMN IF NOT EXISTS adp_worker_id text;
-- ALTER TABLE employees ADD COLUMN IF NOT EXISTS file_number text;

-- Create index for ADP lookups
-- CREATE INDEX IF NOT EXISTS idx_employees_adp_worker_id ON employees(adp_worker_id);

-- ===============================================
-- MIGRATION COMPLETE
-- ===============================================

-- Verify tables were created
SELECT 
    schemaname,
    tablename,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE tablename IN ('pay_runs', 'payroll_inputs', 'pay_run_items', 'pay_lines', 'rate_cards', 'audit_logs')
ORDER BY tablename;