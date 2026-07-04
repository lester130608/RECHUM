-- ============================================================
-- Migration 0009: EMP as first-class payroll area
-- Date: 2026-07-03
-- ============================================================
-- Minimal additive schema change: allow EMP area runs alongside
-- BA, CMHC, and TCM. Existing rows are not renamed here.

ALTER TABLE pay_runs
  DROP CONSTRAINT IF EXISTS pay_runs_area_check,
  DROP CONSTRAINT IF EXISTS pay_runs_area_level_check,
  ADD CONSTRAINT pay_runs_area_check
    CHECK (area IN ('BA', 'CMHC', 'TCM', 'EMP', 'PSYQ', 'GENERAL')),
  ADD CONSTRAINT pay_runs_area_level_check
    CHECK (
      (run_level = 'area' AND area IN ('BA', 'CMHC', 'TCM', 'EMP', 'PSYQ'))
      OR (run_level = 'consolidated' AND area = 'GENERAL')
    );

DROP POLICY IF EXISTS consolidated_run_areas_owner_insert ON consolidated_run_areas;

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
      AND area_run.area IN ('BA', 'CMHC', 'TCM', 'EMP')
      AND area_run.run_level = 'area'
      AND area_run.status = 'owner_approved'
  )
);
