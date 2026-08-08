-- ============================================================
-- BLOQUE DE MIGRACIONES PENDIENTES
-- Fecha: 2026-08-07
-- ============================================================
-- Estado: 0013 ya aplicada (CHECK de payroll_inputs.department con EMP).
-- Faltan: 0009, 0010, 0011, 0012.
--
-- Todas son ADITIVAS: amplían constraints o conceden permisos.
-- Ninguna borra ni modifica datos existentes.
-- Todas son idempotentes: se pueden correr dos veces sin daño.
--
-- CÓMO USARLO
--   Supabase → SQL Editor → pegar TODO → Run.
--   Al final hay un bloque de verificación que dice si quedó bien.
-- ============================================================


-- ============================================================
-- 0009 — EMP como área de primera clase en pay_runs
-- ============================================================
-- Sin esto, crear un pay_run con area='EMP' es rechazado por la DB.
-- Es la pareja de la 0013 que ya aplicaste: 0013 arregló
-- payroll_inputs.department, esta arregla pay_runs.area.
-- Las políticas RLS de 0008 comparan pr.area = payroll_inputs.department,
-- así que hacen falta las dos para que EMP funcione.

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


-- ============================================================
-- 0010 — estados 'draft' y 'review_ready' en payroll_inputs
-- ============================================================
-- El CHECK original solo permitía ('submitted','validated','rejected'),
-- pero el flujo de captura guarda 'draft' y 'review_ready'.
-- Esta es una de las dos causas del fallo de "Save Draft".

ALTER TABLE payroll_inputs
  DROP CONSTRAINT IF EXISTS payroll_inputs_status_check;

ALTER TABLE payroll_inputs
  ADD CONSTRAINT payroll_inputs_status_check
  CHECK (status IN ('draft', 'review_ready', 'submitted', 'validated', 'rejected'));


-- ============================================================
-- 0011 — submitted_at nullable (borradores)
-- ============================================================
-- Un borrador se guarda con submitted_at = NULL, pero la columna
-- era NOT NULL. Segunda causa del fallo de "Save Draft".

ALTER TABLE payroll_inputs
  ALTER COLUMN submitted_at DROP NOT NULL;


-- ============================================================
-- 0012 — permiso manage_assignments a los supervisores
-- ============================================================
-- Solo 'owner' tenía este permiso, por eso los supervisores no podían
-- activar/desactivar empleados de su área.
-- El límite por departamento lo aplica la API (canManageArea).

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, '75a6fdf5-7f41-480a-8509-516e7d5e6b3d'::uuid  -- manage_assignments
FROM roles r
WHERE r.code IN ('supervisor_ba', 'supervisor_cmhc', 'supervisor_tcm')
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = '75a6fdf5-7f41-480a-8509-516e7d5e6b3d'::uuid
  );


-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
-- Todo debe decir OK. Si algo dice FALTA, esa migración no entró.

SELECT '0009 pay_runs.area acepta EMP' AS migracion,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'pay_runs'::regclass
           AND conname = 'pay_runs_area_check'
           AND pg_get_constraintdef(oid) LIKE '%EMP%'
       ) THEN 'OK' ELSE 'FALTA' END AS resultado

UNION ALL
SELECT '0010 payroll_inputs.status acepta draft',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'payroll_inputs'::regclass
           AND conname = 'payroll_inputs_status_check'
           AND pg_get_constraintdef(oid) LIKE '%draft%'
       ) THEN 'OK' ELSE 'FALTA' END

UNION ALL
SELECT '0011 submitted_at nullable',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'payroll_inputs'
           AND column_name = 'submitted_at'
           AND is_nullable = 'YES'
       ) THEN 'OK' ELSE 'FALTA' END

UNION ALL
SELECT '0012 supervisores con manage_assignments',
       CASE WHEN (
         SELECT COUNT(*) FROM role_permissions rp
         JOIN roles r       ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE p.code = 'manage_assignments'
           AND r.code IN ('supervisor_ba', 'supervisor_cmhc', 'supervisor_tcm')
       ) = 3 THEN 'OK' ELSE 'FALTA' END

UNION ALL
SELECT '0013 payroll_inputs.department acepta EMP',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'payroll_inputs'::regclass
           AND conname = 'payroll_inputs_department_check'
           AND pg_get_constraintdef(oid) LIKE '%EMP%'
       ) THEN 'OK' ELSE 'FALTA' END;
