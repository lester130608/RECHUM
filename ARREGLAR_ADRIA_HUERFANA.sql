-- ============================================================
-- Adria Vargas Gonzales: empleada sin asignación
-- 2026-09-01
-- ============================================================
-- Se creó en employees pero la inserción en assignments falló por
-- el problema de mayúsculas en adp_pay_mode. Existe, pero no está
-- en ningún área, así que no aparece en ninguna captura.
--
-- Según tu Excel es RBT en BA (fila 3, tipo 'T', 88.00 horas).
--
-- Idempotente: si ya tiene asignación no hace nada.
-- ============================================================

BEGIN;

INSERT INTO assignments (employee_id, department, role, tax_type, adp_pay_mode, active)
SELECT e.id, 'BA', 'RBT', 'W2', 'HOURLY', true
FROM employees e
WHERE e.email = 'pending.adria.vargas.gonzales@dttcoaching.com'
  AND NOT EXISTS (
      SELECT 1 FROM assignments a WHERE a.employee_id = e.id
  );

COMMIT;


-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- 1. Adria debe aparecer ya asignada a BA como RBT.
SELECT
    COALESCE(e.full_name, e.first_name || ' ' || e.last_name) AS empleada,
    a.department,
    a.role,
    a.tax_type,
    a.adp_pay_mode,
    a.active,
    a.base_rate
FROM employees e
JOIN assignments a ON a.employee_id = e.id
WHERE e.email = 'pending.adria.vargas.gonzales@dttcoaching.com';

-- 2. ¿Queda algún otro huérfano? Debe salir vacío.
SELECT
    COALESCE(e.full_name, e.first_name || ' ' || e.last_name) AS sin_asignacion,
    e.email,
    e.created_at
FROM employees e
WHERE NOT EXISTS (SELECT 1 FROM assignments a WHERE a.employee_id = e.id)
ORDER BY e.created_at DESC;

-- ============================================================
-- PENDIENTE: Adria no tiene base_rate, así que aparecerá en la
-- captura pero el cálculo la marcará como "missing_rate". Su tarifa
-- se asigna desde la pantalla de Employees con la cuenta de owner,
-- o con un UPDATE sobre assignments.base_rate.
-- ============================================================
