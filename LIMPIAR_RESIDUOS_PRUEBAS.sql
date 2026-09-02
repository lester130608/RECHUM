-- ============================================================
-- Limpiar residuos de sesiones de prueba anteriores
-- 2026-09-01
-- ============================================================
-- QUE SON
-- Runs y capturas que quedaron de pruebas viejas y que la pantalla
-- muestra como "Supervisor submitted" o "Owner approved" sin tener
-- un solo importe calculado detras:
--
--   P-20260808 · CMHC · creado 27 ago · 8 personas · 0 items
--   P-20260808 · EMP  · creado 19 ago · 13 personas · 0 items
--   P-20261212 · EMP  · owner_approved · 0 items
--
-- POR QUE HAY QUE QUITARLOS
--   1. Bloquean la captura real: la pantalla no deja editar una captura
--      ya enviada, asi que el supervisor se encuentra datos viejos que
--      no puede tocar.
--   2. Falsean el estado del periodo: "0 de 4 areas aprobadas" cuenta mal.
--   3. Si se consolida con ellos dentro, el total sale mal sin motivo
--      aparente.
--
-- SEGURIDAD
-- Solo borra runs SIN NINGUN pay_run_item calculado. Un area con importes
-- de verdad no se toca, pase lo que pase. Correr el bloque 1 primero para
-- ver exactamente que se va a borrar.
-- ============================================================


-- ------------------------------------------------------------
-- BLOQUE 1 — QUE SE VA A BORRAR (correr esto primero, no borra nada)
-- ------------------------------------------------------------
SELECT
    pp.week_code                                    AS periodo,
    pr.area,
    pr.status                                       AS estado,
    pr.created_at::date                             AS creado,
    COALESCE((SELECT COUNT(*) FROM pay_run_items pri WHERE pri.pay_run_id = pr.id), 0) AS items,
    COALESCE((SELECT COUNT(*) FROM payroll_inputs pi WHERE pi.pay_run_id = pr.id), 0)  AS capturas,
    CASE
        WHEN EXISTS (SELECT 1 FROM pay_run_items pri WHERE pri.pay_run_id = pr.id)
            THEN 'SE CONSERVA — tiene importes calculados'
        ELSE 'se borra'
    END                                             AS accion
FROM pay_runs pr
JOIN pay_periods pp ON pp.id = pr.period_id
WHERE pr.run_level = 'area'
ORDER BY pp.week_code DESC, pr.area;


-- ------------------------------------------------------------
-- BLOQUE 2 — EL BORRADO
-- Correr solo despues de revisar el bloque 1.
-- ------------------------------------------------------------
BEGIN;

-- Las capturas de runs sin importes calculados
DELETE FROM payroll_inputs pi
USING pay_runs pr
WHERE pr.id = pi.pay_run_id
  AND pr.run_level = 'area'
  AND NOT EXISTS (
      SELECT 1 FROM pay_run_items pri WHERE pri.pay_run_id = pr.id
  );

-- Los enlaces de consolidacion que apunten a esos runs
DELETE FROM consolidated_run_areas cra
USING pay_runs pr
WHERE pr.id = cra.area_run_id
  AND pr.run_level = 'area'
  AND NOT EXISTS (
      SELECT 1 FROM pay_run_items pri WHERE pri.pay_run_id = pr.id
  );

-- Y los runs vacios
DELETE FROM pay_runs pr
WHERE pr.run_level = 'area'
  AND NOT EXISTS (
      SELECT 1 FROM pay_run_items pri WHERE pri.pay_run_id = pr.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM payroll_inputs pi WHERE pi.pay_run_id = pr.id
  );

COMMIT;


-- ------------------------------------------------------------
-- BLOQUE 3 — VERIFICACION
-- ------------------------------------------------------------
-- Los runs que queden deben tener todos importes calculados.
SELECT
    pp.week_code AS periodo,
    pr.area,
    pr.status,
    (SELECT COUNT(*) FROM pay_run_items pri WHERE pri.pay_run_id = pr.id) AS items
FROM pay_runs pr
JOIN pay_periods pp ON pp.id = pr.period_id
WHERE pr.run_level = 'area'
ORDER BY pp.week_code DESC, pr.area;

-- Y las filas de prueba de PSYQ, que arrastramos desde el principio.
SELECT
    'payroll_inputs con department PSYQ' AS pendiente,
    COUNT(*)                             AS filas
FROM payroll_inputs
WHERE department = 'PSYQ';
