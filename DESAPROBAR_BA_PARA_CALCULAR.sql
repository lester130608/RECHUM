-- ============================================================
-- Desaprobar BA para poder calcularla — 2026-09-01
-- ============================================================
-- SITUACION
-- BA esta en 'owner_approved' pero con 0 pay_run_items: se aprobo un
-- area que nunca llego a calcular. Aprobar cambia el estado del run,
-- no genera importes.
--
-- Consecuencias en cadena:
--   · BA vale 0 $ en el consolidado
--   · El 1.5% de Edwina lee los items de BA, no encuentra nada, y se
--     queda en Pending
--   · ba-calculation se niega a recalcular un area aprobada, asi que
--     desde la aplicacion no hay salida
--
-- QUE HACE
-- Devuelve BA a 'review_ready' para que se pueda calcular. No toca la
-- captura: las horas que metio Eileen siguen intactas.
--
-- SEGURIDAD
-- Solo actua si el area NO esta consolidada, exportada ni bloqueada.
-- Si ya se hubiera consolidado, esto no la toca y habria que deshacer
-- la consolidacion primero.
-- ============================================================

BEGIN;

UPDATE pay_runs pr
SET status = 'review_ready',
    owner_approved_at = NULL
FROM pay_periods pp
WHERE pp.id = pr.period_id
  AND pr.area = 'BA'
  AND pr.run_level = 'area'
  AND pr.status = 'owner_approved'
  AND NOT EXISTS (
      SELECT 1 FROM pay_run_items pri WHERE pri.pay_run_id = pr.id
  );

COMMIT;


-- ============================================================
-- VERIFICACION
-- ============================================================
-- BA debe quedar en 'review_ready' con 0 items. Si sigue en
-- 'owner_approved', es que YA tiene items y no habia que tocarla.
SELECT
    pp.week_code                AS periodo,
    pr.area,
    pr.status                   AS estado,
    (SELECT COUNT(*) FROM pay_run_items pri WHERE pri.pay_run_id = pr.id) AS items,
    (SELECT COUNT(*) FROM payroll_inputs pi WHERE pi.pay_run_id = pr.id)  AS capturas,
    CASE
        WHEN pr.status = 'review_ready'
            THEN 'LISTA para calcular desde /payroll/owner/ba-calculation'
        WHEN pr.status = 'owner_approved'
            THEN 'sigue aprobada — revisar por que'
        ELSE pr.status
    END                         AS siguiente_paso
FROM pay_runs pr
JOIN pay_periods pp ON pp.id = pr.period_id
WHERE pr.area = 'BA' AND pr.run_level = 'area'
ORDER BY pp.week_code DESC;
