-- ========================================
-- Migration 0006: Owner View support
-- ========================================

-- Tabla para tracking de unlocks
CREATE TABLE IF NOT EXISTS payroll_unlock_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('BA', 'TCM', 'CMHC', 'EMP')),
  unlocked_by UUID REFERENCES auth.users(id),
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unlock_log_period
  ON payroll_unlock_log(pay_period_id);

-- Tabla para guardar exports realizados
CREATE TABLE IF NOT EXISTS payroll_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  exported_by UUID REFERENCES auth.users(id),
  exported_at TIMESTAMPTZ DEFAULT NOW(),
  total_amount NUMERIC(12,2),
  total_lines INTEGER,
  csv_content TEXT,
  UNIQUE (pay_period_id)
);

-- RLS
ALTER TABLE payroll_unlock_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY unlock_log_all ON payroll_unlock_log FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY exports_all ON payroll_exports FOR ALL
  USING (auth.uid() IS NOT NULL);
