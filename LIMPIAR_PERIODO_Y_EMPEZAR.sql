-- ============================================================
-- Limpiar el periodo P-20260808 para hacerlo de cero
-- 2026-09-02
-- ============================================================
-- POR QUE
--   · CMHC tiene una captura residual del 27 de agosto (8 personas)
--     que nadie metio hoy y que el calculo esta usando: 6.000,98 $
--   · BA esta calculado pero con datos malos: Dianeya Ramirez en 0
--     cuando el Excel dice 60, y Aliska Borroto como RBT cuando es
--     BCBA, lo que inflaria la base del 1.5% de Edwina
--   · EMP arrastra la captura residual del 19 de agosto
--
-- Ahora que las cinco areas calculan y los permisos funcionan, sale
-- mas barato rehacerlo bien que arreglar cada dato a mano.
--
-- QUE NO SE TOCA
--   · P-20260725, que esta 'consolidated': es historico real
--   · Cualquier periodo consolidado, exportado o bloqueado
--   · Empleados, tarifas, roles y permisos: nada de eso se borra
--
-- Borra SOLO capturas y calculos del periodo P-20260808.
-- ============================================================


-- ------------------------------------------------------------
-- BLOQUE 1 — QUE SE VA A BORRAR (no borra nada, correr primero)
-- ------------------------------------------------------------
SELECT
    pp.week_code                        AS periodo,
    pr.area,
    pr.status                           AS estado,
    (SELECT COUNT(*) FROM pay_run_items pri WHERE pri.pay_run_id = pr.id)  AS items,
    (SELECT COUNT(*) FROM payroll_inputs pi  WHERE pi.pay_run_id = pr.id)  AS capturas,
    CASE
        WHEN pr.status IN ('consolidated', 'exported', 'locked')
            THEN 'SE CONSERVA — periodo cerrado'
        WHEN pp.week_code = 'P-20260808'
            THEN 'se borra y se rehace'
        ELSE 'SE CONSERVA — otro periodo'
    END                                 AS accion
FROM pay_runs pr
JOIN pay_periods pp ON pp.id = pr.period_id
WHERE pr.run_level = 'area'
ORDER BY pp.week_code DESC, pr.area;


-- ------------------------------------------------------------
-- BLOQUE 2 — EL BORRADO
-- Correr solo despues de revisar el bloque 1.
-- ------------------------------------------------------------
BEGIN;

-- Las lineas de pago del periodo
DELETE FROM pay_lines pl
USING pay_run_items pri, pay_runs pr, pay_periods pp
WHERE pri.id = pl.pay_run_item_id
  AND pr.id = pri.pay_run_id
  AND pp.id = pr.period_id
  AND pp.week_code = 'P-20260808'
  AND pr.run_level = 'area'
  AND pr.status NOT IN ('consolidated', 'exported', 'locked');

-- Los importes por trabajador
DELETE FROM pay_run_items pri
USING pay_runs pr, pay_periods pp
WHERE pr.id = pri.pay_run_id
  AND pp.id = pr.period_id
  AND pp.week_code = 'P-20260808'
  AND pr.run_level = 'area'
  AND pr.status NOT IN ('consolidated', 'exported', 'locked');

-- Las capturas
DELETE FROM payroll_inputs pi
USING pay_runs pr, pay_periods pp
WHERE pr.id = pi.pay_run_id
  AND pp.id = pr.period_id
  AND pp.week_code = 'P-20260808'
  AND pr.run_level = 'area'
  AND pr.status NOT IN ('consolidated', 'exported', 'locked');

-- Y los runs, para que cada area vuelva a 'Not started'
DELETE FROM pay_runs pr
USING pay_periods pp
WHERE pp.id = pr.period_id
  AND pp.week_code = 'P-20260808'
  AND pr.run_level = 'area'
  AND pr.status NOT IN ('consolidated', 'exported', 'locked');

COMMIT;


-- ------------------------------------------------------------
-- BLOQUE 3 — VERIFICACION
-- ------------------------------------------------------------
-- P-20260808 no debe devolver ninguna fila: las cuatro areas
-- apareceran como "Not started" en la pantalla del owner.
SELECT
    pp.week_code AS periodo,
    pr.area,
    pr.status,
    (SELECT COUNT(*) FROM pay_run_items pri WHERE pri.pay_run_id = pr.id) AS items
FROM pay_runs pr
JOIN pay_periods pp ON pp.id = pr.period_id
WHERE pr.run_level = 'area'
ORDER BY pp.week_code DESC, pr.area;

-- Y comprobar que lo importante sigue intacto.
SELECT 'empleados activos en EMP' AS dato, COUNT(*)::text AS valor
FROM assignments WHERE department = 'EMP' AND active
UNION ALL
SELECT 'empleados activos en BA', COUNT(*)::text
FROM assignments WHERE department = 'BA' AND active
UNION ALL
SELECT 'tarifas configuradas', COUNT(*)::text
FROM pay_role_rates r JOIN pay_role_configs c ON c.id = r.pay_role_config_id
WHERE c.active
UNION ALL
SELECT 'Aliska sigue como', COALESCE(MAX(a.role), '(no encontrada)')
FROM assignments a JOIN employees e ON e.id = a.employee_id
WHERE e.full_name = 'Aliska Borroto' AND a.active AND a.department = 'BA';
