-- ============================================================
-- VERIFICACIÓN DE ESTADO DE LA BASE — 2026-08-30
-- ============================================================
-- Correr en Supabase → SQL Editor → pegar todo → Run.
--
-- No modifica nada. Solo dice qué está aplicado y qué falta.
-- Correr ANTES de aplicar nada, y otra vez DESPUÉS para confirmar.
-- ============================================================


-- ------------------------------------------------------------
-- 1. ¿Existen las tablas que el código necesita?
-- ------------------------------------------------------------
SELECT
    t.tabla,
    CASE WHEN c.table_name IS NULL THEN '❌ FALTA' ELSE '✅ existe' END AS estado,
    t.la_necesita
FROM (VALUES
    ('pay_runs',                'núcleo: un run por área y periodo'),
    ('pay_run_items',           'núcleo: el importe por trabajador'),
    ('payroll_inputs',          'núcleo: la captura cruda'),
    ('pay_periods',             'núcleo: los 25 periodos'),
    ('consolidated_run_areas',  '0008: enlaza run consolidado con los de área'),
    ('assignments',             'rol y departamento del empleado'),
    ('pay_role_configs',        '0014: tax_type y rol de pago'),
    ('pay_role_rates',          '0014: tarifas, incluido el % de Edwina'),
    ('payroll_emp_entries',     '0004: módulo EMP'),
    ('payroll_emp_module_status','0004: estado del módulo EMP')
) AS t(tabla, la_necesita)
LEFT JOIN information_schema.tables c
       ON c.table_name = t.tabla
      AND c.table_schema = 'public'
ORDER BY estado DESC, t.tabla;


-- ------------------------------------------------------------
-- 2. Migración 0009 — ¿pay_runs.area acepta 'EMP'?
-- Si no aparece EMP, la captura de oficina falla contra la base.
-- ------------------------------------------------------------
SELECT
    'pay_runs.area' AS constraint_,
    CASE WHEN pg_get_constraintdef(oid) LIKE '%EMP%'
         THEN '✅ 0009 aplicada'
         ELSE '❌ 0009 PENDIENTE' END AS estado,
    pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'pay_runs'::regclass
  AND contype = 'c'
  AND conname LIKE '%area%';


-- ------------------------------------------------------------
-- 3. Migración 0010 — ¿payroll_inputs.status acepta 'draft'?
-- Es una de las dos causas del fallo de "Save Draft" en supervisores.
-- ------------------------------------------------------------
SELECT
    'payroll_inputs.status' AS constraint_,
    CASE WHEN pg_get_constraintdef(oid) LIKE '%draft%'
         THEN '✅ 0010 aplicada'
         ELSE '❌ 0010 PENDIENTE — Save Draft seguirá fallando' END AS estado,
    pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'payroll_inputs'::regclass
  AND contype = 'c'
  AND conname LIKE '%status%';


-- ------------------------------------------------------------
-- 4. Migración 0013 — ¿payroll_inputs.department acepta 'EMP'?
-- ------------------------------------------------------------
SELECT
    'payroll_inputs.department' AS constraint_,
    CASE WHEN pg_get_constraintdef(oid) LIKE '%EMP%'
         THEN '✅ 0013 aplicada'
         ELSE '❌ 0013 PENDIENTE' END AS estado,
    pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'payroll_inputs'::regclass
  AND contype = 'c'
  AND conname LIKE '%department%';


-- ------------------------------------------------------------
-- 5. RLS de employees / assignments
-- El código ya permite a supervisores crear, editar, pausar y eliminar
-- empleados de su área. Si estas políticas son solo-owner, la base lo
-- rechaza igual y el supervisor ve un error sin explicación.
-- ------------------------------------------------------------
SELECT
    tablename,
    policyname,
    cmd AS operacion,
    roles,
    qual AS condicion_using
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('employees', 'assignments')
ORDER BY tablename, cmd, policyname;

-- Si la consulta anterior vuelve VACÍA para 'assignments', comprobar
-- si RLS está siquiera activado:
SELECT
    relname AS tabla,
    CASE WHEN relrowsecurity THEN 'RLS activado' ELSE '⚠️ RLS DESACTIVADO' END AS estado
FROM pg_class
WHERE relname IN ('employees', 'assignments')
  AND relnamespace = 'public'::regnamespace;


-- ------------------------------------------------------------
-- 6. Migración 0014 — configuración de roles de pago
-- ------------------------------------------------------------
SELECT
    'pay_role_configs' AS tabla,
    COUNT(*) AS configs_activas,
    COUNT(*) FILTER (WHERE role = 'OUTREACH') AS configs_outreach
FROM pay_role_configs
WHERE active;

-- La config de Edwina. Si vuelve vacío, su 1.5% no se calcula
-- (y ahora lo dirá explícitamente en pantalla en vez de mostrar $0.00).
SELECT
    e.full_name,
    c.role,
    c.tax_type,
    r.rate_key,
    r.rate_value AS porcentaje,
    r.base_reference AS base
FROM pay_role_configs c
JOIN employees e ON e.id = c.employee_id
LEFT JOIN pay_role_rates r ON r.pay_role_config_id = c.id
WHERE c.active
  AND r.rate_key = 'PERCENT';


-- ------------------------------------------------------------
-- 7. Datos de prueba a limpiar
-- Filas de PSYQ de pruebas anteriores que contaminarían el E2E.
-- ------------------------------------------------------------
SELECT
    department,
    status,
    COUNT(*) AS filas
FROM payroll_inputs
GROUP BY department, status
ORDER BY department, status;


-- ------------------------------------------------------------
-- 8. El área EMP no tiene motor de cálculo
-- Existen ba/tcm/cmhc/psyq-calculation, que escriben pay_run_items.
-- NO existe emp-calculation. Esta consulta lo confirma sobre datos
-- reales: si EMP tiene runs pero 0 items, aporta $0 al consolidado.
-- ------------------------------------------------------------
SELECT
    pr.area,
    COUNT(DISTINCT pr.id)      AS runs,
    COUNT(pri.id)              AS items,
    COALESCE(SUM(pri.calc_total_amount), 0) AS importe_total,
    CASE WHEN COUNT(pri.id) = 0 AND COUNT(DISTINCT pr.id) > 0
         THEN '⚠️ tiene runs pero ningún item: aporta 0 al consolidado'
         ELSE 'ok' END AS aviso
FROM pay_runs pr
LEFT JOIN pay_run_items pri ON pri.pay_run_id = pr.id
WHERE pr.run_level = 'area'
GROUP BY pr.area
ORDER BY pr.area;
