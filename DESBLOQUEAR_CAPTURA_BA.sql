-- ============================================================
-- Devolver la captura de BA a borrador — 2026-09-01
-- ============================================================
-- POR QUE
-- Eileen envió BA con dos errores detectados al cuadrar contra el Excel:
--   · Dianeya Ramirez con 0 horas (deberian ser 60.00)
--   · Aliska Borroto dada de alta como RBT (es BCBA)
--
-- La pantalla bloquea la edicion tras el envio y no tenia excepcion
-- para el owner, asi que no habia forma de corregirlo desde la app.
--
-- Esto devuelve la captura a 'draft' para que se pueda corregir por el
-- camino normal, en vez de editar el payload a mano. El rastro de
-- auditoria queda limpio: corrige quien capturo.
--
-- SOLO funciona si el area NO esta aprobada todavia. Si ya lo estuviera,
-- el sistema lo impide a proposito y habria que desaprobar primero.
-- ============================================================

BEGIN;

-- 1. La captura vuelve a borrador
UPDATE payroll_inputs pi
SET status = 'draft',
    submitted_at = NULL
FROM pay_runs pr
WHERE pr.id = pi.pay_run_id
  AND pi.department = 'BA'
  AND pr.area = 'BA'
  AND pr.run_level = 'area'
  AND pr.period_id = (
      SELECT id FROM pay_periods WHERE week_code = 'P-20260808'
  )
  AND pr.status NOT IN ('owner_approved', 'consolidated', 'exported', 'locked');

-- 2. El run vuelve a borrador
UPDATE pay_runs
SET status = 'draft'
WHERE area = 'BA'
  AND run_level = 'area'
  AND period_id = (SELECT id FROM pay_periods WHERE week_code = 'P-20260808')
  AND status NOT IN ('owner_approved', 'consolidated', 'exported', 'locked');

-- 3. El rol de Aliska: RBT -> BCBA
--    Importante para el dinero: el 1.5% de Edwina se calcula sobre el
--    bruto de los RBT. Con Aliska mal clasificada, sus 26 horas entran
--    en esa base y Edwina cobraria de mas.
UPDATE assignments a
SET role = 'BCBA'
FROM employees e
WHERE e.id = a.employee_id
  AND e.full_name = 'Aliska Borroto'
  AND a.department = 'BA'
  AND a.active;

COMMIT;


-- ============================================================
-- VERIFICACION
-- ============================================================
-- 1. La captura debe estar en 'draft' y el run tambien.
SELECT
    pr.area,
    pr.status        AS estado_run,
    pi.status        AS estado_captura,
    pi.submitted_at
FROM pay_runs pr
LEFT JOIN payroll_inputs pi ON pi.pay_run_id = pr.id AND pi.department = 'BA'
WHERE pr.area = 'BA'
  AND pr.run_level = 'area'
  AND pr.period_id = (SELECT id FROM pay_periods WHERE week_code = 'P-20260808');

-- 2. Aliska debe salir como BCBA.
SELECT
    COALESCE(e.full_name, e.first_name || ' ' || e.last_name) AS empleada,
    a.department,
    a.role,
    a.base_rate
FROM employees e
JOIN assignments a ON a.employee_id = e.id
WHERE e.full_name IN ('Aliska Borroto', 'Dianeya Ramirez')
  AND a.active;

-- 3. Quien sigue sin tarifa en BA. Estos bloquearan el calculo.
SELECT
    COALESCE(e.full_name, e.first_name || ' ' || e.last_name) AS sin_tarifa,
    a.role
FROM employees e
JOIN assignments a ON a.employee_id = e.id
WHERE a.department = 'BA' AND a.active AND a.base_rate IS NULL
ORDER BY 1;
