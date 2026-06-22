-- ========================================
-- Migration 0004: EMP Module
-- ========================================

-- Enum para estado del módulo EMP por pay period
CREATE TYPE emp_module_status_enum AS ENUM ('DRAFT', 'SUBMITTED', 'LOCKED');

-- Enum para el tipo de decisión de rate cuando hay conflicto
CREATE TYPE rate_decision_enum AS ENUM (
  'auto_single',    -- sin conflicto, rate único
  'manual_old',     -- usar rate viejo para todas las horas
  'manual_new',     -- usar rate nuevo para todas las horas
  'manual_prorate', -- pro-rate por fecha de cambio
  'fixed_salary',   -- empleado con fixed salary
  'outreach_pct'    -- Edwina, calculado 2% del BA total
);

-- Tabla principal: entries del módulo EMP
CREATE TABLE payroll_emp_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Hours captured
  hours NUMERIC(8,2),                      -- nullable para fixed salary y outreach
  prorate_date DATE,                       -- nullable, solo si rate_decision_type='manual_prorate'
  
  -- Rate decision
  rate_decision_type rate_decision_enum NOT NULL DEFAULT 'auto_single',
  rate_old NUMERIC(10,4),                  -- rate viejo si hubo cambio
  rate_new NUMERIC(10,4),                  -- rate nuevo si hubo cambio
  rate_used NUMERIC(10,4),                 -- rate efectivamente usado para el cálculo
  rate_decision_note TEXT,                 -- audit trail human-readable
  
  -- Calculation
  subtotal NUMERIC(12,2),                  -- calculado y persistido
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  UNIQUE (pay_period_id, employee_id)
);

CREATE INDEX idx_emp_entries_pay_period ON payroll_emp_entries(pay_period_id);
CREATE INDEX idx_emp_entries_employee ON payroll_emp_entries(employee_id);

-- Tabla de estado del módulo por pay period
CREATE TABLE payroll_emp_module_status (
  pay_period_id UUID PRIMARY KEY REFERENCES pay_periods(id) ON DELETE CASCADE,
  status emp_module_status_enum NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger updated_at
CREATE TRIGGER update_emp_entries_updated_at
  BEFORE UPDATE ON payroll_emp_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emp_module_status_updated_at
  BEFORE UPDATE ON payroll_emp_module_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE payroll_emp_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_emp_module_status ENABLE ROW LEVEL SECURITY;

-- Solo usuarios con permiso manage_employees pueden ver/modificar
CREATE POLICY emp_entries_select ON payroll_emp_entries FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY emp_entries_insert ON payroll_emp_entries FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY emp_entries_update ON payroll_emp_entries FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY emp_entries_delete ON payroll_emp_entries FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY emp_module_status_all ON payroll_emp_module_status FOR ALL
  USING (auth.uid() IS NOT NULL);
