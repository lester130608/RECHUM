-- ============================================================
-- Migration 0008: Two-layer payroll anchored to pay_periods
-- Date: 2026-06-23
-- ============================================================
-- pay_runs becomes the workflow header:
--   area runs: BA, CMHC, TCM, PSYQ
--   consolidated runs: GENERAL
-- Dates come from pay_periods. week_ending remains only for compatibility.

-- ============================================================
-- 1. pay_runs: anchor to pay_periods + two-layer metadata
-- ============================================================

ALTER TABLE pay_runs
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES pay_periods(id),
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS run_level text,
  ADD COLUMN IF NOT EXISTS supervisor_approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS supervisor_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES pay_runs(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pay_runs'
      AND column_name = 'approved_by'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pay_runs'
      AND column_name = 'owner_approved_by'
  ) THEN
    ALTER TABLE pay_runs RENAME COLUMN approved_by TO owner_approved_by;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pay_runs'
      AND column_name = 'approved_at'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pay_runs'
      AND column_name = 'owner_approved_at'
  ) THEN
    ALTER TABLE pay_runs RENAME COLUMN approved_at TO owner_approved_at;
  END IF;
END $$;

ALTER TABLE pay_runs
  ADD COLUMN IF NOT EXISTS owner_approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS owner_approved_at timestamptz;

UPDATE pay_runs
SET area = COALESCE(area, 'GENERAL'),
    run_level = COALESCE(run_level, 'consolidated')
WHERE area IS NULL
   OR run_level IS NULL;

ALTER TABLE pay_runs
  ALTER COLUMN area SET NOT NULL,
  ALTER COLUMN run_level SET NOT NULL,
  ALTER COLUMN week_ending DROP NOT NULL;

ALTER TABLE pay_runs
  DROP CONSTRAINT IF EXISTS pay_runs_week_ending_key;

-- Existing production state is verified as 0 rows before this migration.
ALTER TABLE pay_runs
  ALTER COLUMN period_id SET NOT NULL;

ALTER TABLE pay_runs
  DROP CONSTRAINT IF EXISTS pay_runs_area_check,
  DROP CONSTRAINT IF EXISTS pay_runs_run_level_check,
  DROP CONSTRAINT IF EXISTS pay_runs_status_check,
  DROP CONSTRAINT IF EXISTS pay_runs_area_level_check,
  ADD CONSTRAINT pay_runs_area_check
    CHECK (area IN ('BA', 'CMHC', 'TCM', 'PSYQ', 'GENERAL')),
  ADD CONSTRAINT pay_runs_run_level_check
    CHECK (run_level IN ('area', 'consolidated')),
  ADD CONSTRAINT pay_runs_status_check
    CHECK (
      (
        run_level = 'area'
        AND status IN ('draft', 'review_ready', 'supervisor_approved', 'owner_approved', 'consolidated')
      )
      OR (
        run_level = 'consolidated'
        AND status IN ('draft', 'owner_approved', 'exported', 'locked')
      )
    ),
  ADD CONSTRAINT pay_runs_area_level_check
    CHECK (
      (run_level = 'area' AND area IN ('BA', 'CMHC', 'TCM', 'PSYQ'))
      OR (run_level = 'consolidated' AND area = 'GENERAL')
    );

CREATE INDEX IF NOT EXISTS idx_pay_runs_period_id
  ON pay_runs(period_id);

CREATE INDEX IF NOT EXISTS idx_pay_runs_period_area
  ON pay_runs(period_id, area);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_runs_one_area_per_period
  ON pay_runs(period_id, area)
  WHERE area <> 'GENERAL';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_runs_one_general_per_period
  ON pay_runs(period_id)
  WHERE area = 'GENERAL';

-- ============================================================
-- 2. Bridge: consolidated run includes selected area runs
-- ============================================================

CREATE TABLE IF NOT EXISTS consolidated_run_areas (
  consolidated_run_id uuid REFERENCES pay_runs(id) ON DELETE CASCADE,
  area_run_id uuid REFERENCES pay_runs(id) ON DELETE CASCADE,
  PRIMARY KEY (consolidated_run_id, area_run_id)
);

ALTER TABLE consolidated_run_areas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION user_supervises_area(area_name text)
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
        lower(r.code) = 'owner'
        OR lower(r.name) = 'owner'
        OR (
          upper(area_name) = 'BA'
          AND (lower(r.code) = 'supervisor_ba' OR lower(r.name) = 'supervisor_ba')
        )
        OR (
          upper(area_name) = 'CMHC'
          AND (lower(r.code) = 'supervisor_cmhc' OR lower(r.name) = 'supervisor_cmhc')
        )
        OR (
          upper(area_name) = 'TCM'
          AND (lower(r.code) = 'supervisor_tcm' OR lower(r.name) = 'supervisor_tcm')
        )
      )
  );
$$;

-- ============================================================
-- 4. Remove ghost-role policies verified in pg_policies
-- ============================================================

DROP POLICY IF EXISTS "Owner admin can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert own audit logs" ON audit_logs;

DROP POLICY IF EXISTS "Privileged roles can view pay lines" ON pay_lines;
DROP POLICY IF EXISTS "Owner admin can manage pay lines" ON pay_lines;

DROP POLICY IF EXISTS "Privileged roles can view pay run items" ON pay_run_items;
DROP POLICY IF EXISTS "Owner admin can manage pay run items" ON pay_run_items;

DROP POLICY IF EXISTS "Payroll roles can view pay runs" ON pay_runs;
DROP POLICY IF EXISTS "Owner admin can create pay runs" ON pay_runs;
DROP POLICY IF EXISTS "Owner admin can update pay runs" ON pay_runs;

DROP POLICY IF EXISTS "Allowed roles can insert own payroll inputs" ON payroll_inputs;
DROP POLICY IF EXISTS "Users can view own inputs or privileged roles" ON payroll_inputs;

DROP POLICY IF EXISTS pay_runs_two_layer_select ON pay_runs;
DROP POLICY IF EXISTS pay_runs_two_layer_insert ON pay_runs;
DROP POLICY IF EXISTS pay_runs_two_layer_update ON pay_runs;

DROP POLICY IF EXISTS payroll_inputs_two_layer_select ON payroll_inputs;
DROP POLICY IF EXISTS payroll_inputs_two_layer_insert ON payroll_inputs;
DROP POLICY IF EXISTS payroll_inputs_two_layer_update ON payroll_inputs;

DROP POLICY IF EXISTS pay_run_items_two_layer_select ON pay_run_items;
DROP POLICY IF EXISTS pay_run_items_owner_insert ON pay_run_items;
DROP POLICY IF EXISTS pay_run_items_owner_update ON pay_run_items;
DROP POLICY IF EXISTS pay_run_items_owner_delete ON pay_run_items;

DROP POLICY IF EXISTS pay_lines_two_layer_select ON pay_lines;
DROP POLICY IF EXISTS pay_lines_owner_insert ON pay_lines;
DROP POLICY IF EXISTS pay_lines_owner_update ON pay_lines;
DROP POLICY IF EXISTS pay_lines_owner_delete ON pay_lines;

DROP POLICY IF EXISTS audit_logs_owner_select ON audit_logs;
DROP POLICY IF EXISTS audit_logs_authenticated_insert_own ON audit_logs;

DROP POLICY IF EXISTS consolidated_run_areas_owner_select ON consolidated_run_areas;
DROP POLICY IF EXISTS consolidated_run_areas_owner_insert ON consolidated_run_areas;
DROP POLICY IF EXISTS consolidated_run_areas_owner_delete ON consolidated_run_areas;

-- ============================================================
-- 5. New two-layer RLS policies
-- ============================================================
-- Visibility decision for money/rates:
-- pay_run_items and pay_lines contain amount/rate columns. Supervisors must not
-- read those tables directly. Supervisor-facing responses must come from API
-- serializers or non-money input data; owner is the only direct RLS reader here.

CREATE POLICY pay_runs_two_layer_select ON pay_runs
FOR SELECT TO authenticated
USING (user_supervises_area(area));

CREATE POLICY pay_runs_two_layer_insert ON pay_runs
FOR INSERT TO authenticated
WITH CHECK (
  user_supervises_area(area)
  AND (
    current_user_has_any_role(ARRAY['owner'])
    OR (run_level = 'area' AND area IN ('BA', 'CMHC', 'TCM'))
  )
);

CREATE POLICY pay_runs_two_layer_update ON pay_runs
FOR UPDATE TO authenticated
USING (
  user_supervises_area(area)
  AND status <> 'locked'
  AND (
    current_user_has_any_role(ARRAY['owner'])
    OR (run_level = 'area' AND area IN ('BA', 'CMHC', 'TCM'))
  )
)
WITH CHECK (
  user_supervises_area(area)
  AND status <> 'locked'
  AND (
    current_user_has_any_role(ARRAY['owner'])
    OR (run_level = 'area' AND area IN ('BA', 'CMHC', 'TCM'))
  )
);

CREATE POLICY payroll_inputs_two_layer_select ON payroll_inputs
FOR SELECT TO authenticated
USING (
  user_supervises_area(department)
  AND EXISTS (
    SELECT 1
    FROM pay_runs pr
    WHERE pr.id = payroll_inputs.pay_run_id
      AND pr.area = payroll_inputs.department
      AND pr.run_level = 'area'
  )
);

CREATE POLICY payroll_inputs_two_layer_insert ON payroll_inputs
FOR INSERT TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND user_supervises_area(department)
  AND EXISTS (
    SELECT 1
    FROM pay_runs pr
    WHERE pr.id = payroll_inputs.pay_run_id
      AND pr.area = payroll_inputs.department
      AND pr.run_level = 'area'
      AND pr.status IN ('draft', 'review_ready')
  )
);

CREATE POLICY payroll_inputs_two_layer_update ON payroll_inputs
FOR UPDATE TO authenticated
USING (
  user_supervises_area(department)
  AND EXISTS (
    SELECT 1
    FROM pay_runs pr
    WHERE pr.id = payroll_inputs.pay_run_id
      AND pr.area = payroll_inputs.department
      AND pr.run_level = 'area'
      AND pr.status IN ('draft', 'review_ready')
  )
)
WITH CHECK (
  user_supervises_area(department)
  AND EXISTS (
    SELECT 1
    FROM pay_runs pr
    WHERE pr.id = payroll_inputs.pay_run_id
      AND pr.area = payroll_inputs.department
      AND pr.run_level = 'area'
      AND pr.status IN ('draft', 'review_ready')
  )
);

CREATE POLICY pay_run_items_two_layer_select ON pay_run_items
FOR SELECT TO authenticated
USING (current_user_has_any_role(ARRAY['owner']));

CREATE POLICY pay_run_items_owner_insert ON pay_run_items
FOR INSERT TO authenticated
WITH CHECK (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_runs pr
    WHERE pr.id = pay_run_items.pay_run_id
      AND pr.status <> 'locked'
  )
);

CREATE POLICY pay_run_items_owner_update ON pay_run_items
FOR UPDATE TO authenticated
USING (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_runs pr
    WHERE pr.id = pay_run_items.pay_run_id
      AND pr.status <> 'locked'
  )
)
WITH CHECK (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_runs pr
    WHERE pr.id = pay_run_items.pay_run_id
      AND pr.status <> 'locked'
  )
);

CREATE POLICY pay_run_items_owner_delete ON pay_run_items
FOR DELETE TO authenticated
USING (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_runs pr
    WHERE pr.id = pay_run_items.pay_run_id
      AND pr.status <> 'locked'
  )
);

CREATE POLICY pay_lines_two_layer_select ON pay_lines
FOR SELECT TO authenticated
USING (current_user_has_any_role(ARRAY['owner']));

CREATE POLICY pay_lines_owner_insert ON pay_lines
FOR INSERT TO authenticated
WITH CHECK (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_run_items pri
    JOIN pay_runs pr ON pr.id = pri.pay_run_id
    WHERE pri.id = pay_lines.pay_run_item_id
      AND pr.status <> 'locked'
  )
);

CREATE POLICY pay_lines_owner_update ON pay_lines
FOR UPDATE TO authenticated
USING (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_run_items pri
    JOIN pay_runs pr ON pr.id = pri.pay_run_id
    WHERE pri.id = pay_lines.pay_run_item_id
      AND pr.status <> 'locked'
  )
)
WITH CHECK (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_run_items pri
    JOIN pay_runs pr ON pr.id = pri.pay_run_id
    WHERE pri.id = pay_lines.pay_run_item_id
      AND pr.status <> 'locked'
  )
);

CREATE POLICY pay_lines_owner_delete ON pay_lines
FOR DELETE TO authenticated
USING (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_run_items pri
    JOIN pay_runs pr ON pr.id = pri.pay_run_id
    WHERE pri.id = pay_lines.pay_run_item_id
      AND pr.status <> 'locked'
  )
);

CREATE POLICY audit_logs_owner_select ON audit_logs
FOR SELECT TO authenticated
USING (current_user_has_any_role(ARRAY['owner']));

CREATE POLICY audit_logs_authenticated_insert_own ON audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND actor_id = auth.uid()
);

CREATE POLICY consolidated_run_areas_owner_select ON consolidated_run_areas
FOR SELECT TO authenticated
USING (current_user_has_any_role(ARRAY['owner']));

CREATE POLICY consolidated_run_areas_owner_insert ON consolidated_run_areas
FOR INSERT TO authenticated
WITH CHECK (
  current_user_has_any_role(ARRAY['owner'])
  AND EXISTS (
    SELECT 1
    FROM pay_runs consolidated
    WHERE consolidated.id = consolidated_run_areas.consolidated_run_id
      AND consolidated.area = 'GENERAL'
      AND consolidated.run_level = 'consolidated'
  )
  AND EXISTS (
    SELECT 1
    FROM pay_runs area_run
    WHERE area_run.id = consolidated_run_areas.area_run_id
      AND area_run.area IN ('BA', 'CMHC', 'TCM', 'PSYQ')
      AND area_run.run_level = 'area'
      AND area_run.status = 'owner_approved'
  )
);

CREATE POLICY consolidated_run_areas_owner_delete ON consolidated_run_areas
FOR DELETE TO authenticated
USING (current_user_has_any_role(ARRAY['owner']));
