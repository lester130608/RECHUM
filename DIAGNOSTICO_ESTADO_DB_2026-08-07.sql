-- ============================================================
-- DIAGNÓSTICO: estado real de la base de datos live
-- Fecha: 2026-08-07
-- ============================================================
-- 100% SOLO LECTURA. No inserta, no borra, no altera nada.
-- Objetivo: saber qué migraciones (0009-0012) están realmente
-- aplicadas en Supabase antes de probar o de aplicar nada.
--
-- CÓMO USARLO:
--   Supabase → SQL Editor → pegar TODO → Run.
--   Copiar los 5 resultados y mandármelos.
-- ============================================================


-- ------------------------------------------------------------
-- 1) ¿Migración 0010 aplicada? (CHECK de payroll_inputs.status)
-- ------------------------------------------------------------
-- ESPERADO SI ESTÁ APLICADA: la definición incluye 'draft' y 'review_ready'
-- SI NO: solo aparecen 'submitted','validated','rejected'
--        → Save Draft falla para TODOS (owner incluido)
SELECT
  '1. CHECK status' AS chequeo,
  conname           AS constraint_name,
  pg_get_constraintdef(oid) AS definicion,
  CASE
    WHEN pg_get_constraintdef(oid) LIKE '%draft%' THEN 'OK - 0010 aplicada'
    ELSE 'FALTA - aplicar 0010'
  END AS veredicto
FROM pg_constraint
WHERE conrelid = 'payroll_inputs'::regclass
  AND contype = 'c'
  AND conname LIKE '%status%';


-- ------------------------------------------------------------
-- 2) ¿Migración 0011 aplicada? (submitted_at nullable)
-- ------------------------------------------------------------
-- ESPERADO SI ESTÁ APLICADA: is_nullable = YES
-- SI NO: guardar borrador falla con "Failed to save input"
SELECT
  '2. submitted_at' AS chequeo,
  column_name,
  is_nullable,
  CASE
    WHEN is_nullable = 'YES' THEN 'OK - 0011 aplicada'
    ELSE 'FALTA - aplicar 0011'
  END AS veredicto
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name  = 'payroll_inputs'
  AND column_name = 'submitted_at';


-- ------------------------------------------------------------
-- 3) ¿Migración 0012 aplicada? (manage_assignments a supervisores)
-- ------------------------------------------------------------
-- ESPERADO SI ESTÁ APLICADA: 4 filas → owner + supervisor_ba/cmhc/tcm
-- SI NO: solo owner → supervisores no pueden editar/pausar/remove empleados
SELECT
  '3. manage_assignments' AS chequeo,
  r.code AS rol_con_permiso
FROM role_permissions rp
JOIN roles       r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'manage_assignments'
ORDER BY r.code;


-- ------------------------------------------------------------
-- 4) ¿Migración 0009 aplicada? (EMP como área de primera clase)
-- ------------------------------------------------------------
-- ESPERADO SI ESTÁ APLICADA: la definición incluye 'EMP'
-- SI NO: crear un pay_run de área EMP es rechazado por la DB
SELECT
  '4. CHECK area pay_runs' AS chequeo,
  conname                  AS constraint_name,
  pg_get_constraintdef(oid) AS definicion,
  CASE
    WHEN pg_get_constraintdef(oid) LIKE '%EMP%' THEN 'OK - 0009 aplicada'
    ELSE 'FALTA - aplicar 0009'
  END AS veredicto
FROM pg_constraint
WHERE conrelid = 'pay_runs'::regclass
  AND contype = 'c'
  AND conname IN ('pay_runs_area_check', 'pay_runs_area_level_check');


-- ------------------------------------------------------------
-- 5) Basura de pruebas anteriores (department = 'PSYQ')
-- ------------------------------------------------------------
-- ESPERADO: 0 filas. Si hay filas, hay que limpiarlas antes del E2E.
SELECT
  '5. filas PSYQ de prueba' AS chequeo,
  COUNT(*) AS filas
FROM payroll_inputs
WHERE department = 'PSYQ';


-- ------------------------------------------------------------
-- 6) EXTRA: qué hay ya cargado (para elegir período de prueba)
-- ------------------------------------------------------------
SELECT
  '6. pay_runs existentes' AS chequeo,
  area,
  run_level,
  status,
  COUNT(*) AS cantidad
FROM pay_runs
GROUP BY area, run_level, status
ORDER BY area, run_level, status;
