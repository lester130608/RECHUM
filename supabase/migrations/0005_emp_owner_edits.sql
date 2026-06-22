-- ========================================
-- Migration 0005: Owner edits tracking
-- ========================================

-- Agregar columnas a payroll_emp_entries para tracking de edits del owner
ALTER TABLE payroll_emp_entries 
  ADD COLUMN IF NOT EXISTS original_hours NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS edited_by_owner BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_note TEXT,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Agregar columna capture_opens_at a pay_periods para regla "viernes antes"
ALTER TABLE pay_periods
  ADD COLUMN IF NOT EXISTS capture_opens_at DATE;

-- Calcular automáticamente: 7 días antes del pay_date (viernes anterior)
UPDATE pay_periods 
SET capture_opens_at = pay_date - INTERVAL '7 days'
WHERE capture_opens_at IS NULL;

-- Hacer NOT NULL después de llenar
ALTER TABLE pay_periods 
  ALTER COLUMN capture_opens_at SET NOT NULL;

-- Índice para queries de "qué período está activo hoy"
CREATE INDEX IF NOT EXISTS idx_pay_periods_capture_window 
  ON pay_periods(capture_opens_at, pay_date, status);
