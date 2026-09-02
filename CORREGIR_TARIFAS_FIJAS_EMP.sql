-- ============================================================
-- Tarifas fijas de EMP: pasar de total-de-periodo a tarifa-unidad
-- 2026-09-01
-- ============================================================
-- QUE CAMBIA
-- Ayer guardamos el importe YA MULTIPLICADO (Yeline 1100, Ripoll 2000)
-- porque el motor pagaba un fijo plano e ignoraba lo capturado.
--
-- Hoy Lester confirmo que el numero capturado MULTIPLICA:
--
--   Yeline  2 x   550 por semana   = 1100
--   Ripoll  2 x 1.000 por semana   = 2000
--   Oscar   1 x   850 por quincena =  850
--   Gayol   1 x 1.500 por quincena = 1500
--
-- Asi que rate_value pasa a ser la tarifa de UNA unidad. Si no se
-- corrige, Yeline saldria 2 x 1100 = 2200: el doble.
--
-- La unidad se guarda en notes ('week' / 'period'), que es lo que la
-- pantalla muestra junto al importe para que quien capture sepa si
-- ese campo cuenta semanas o quincenas.
--
-- ⚠️  CORRER ESTO ANTES DE DESPLEGAR EL CODIGO NUEVO.
-- ============================================================

BEGIN;

WITH tarifas(nombre, tarifa_unidad, unidad) AS (
    VALUES
        ('Yeline Munoz',         550::numeric,  'week'),    -- era 1100 (2 semanas)
        ('Carlos Ripoll',       1000::numeric,  'week'),    -- era 2000 (2 semanas)
        ('Oscar Acevedo',        850::numeric,  'period'),  -- sin cambio de importe
        ('Julio Castro Gallol', 1500::numeric,  'period')   -- sin cambio de importe
)
UPDATE pay_role_rates r
SET rate_value = t.tarifa_unidad,
    notes      = t.unidad,
    updated_at = now()
FROM pay_role_configs c, employees e, tarifas t
WHERE r.pay_role_config_id = c.id
  AND c.employee_id = e.id
  AND c.active
  AND r.rate_key = 'FIXED_SALARY'
  AND e.full_name = t.nombre;

COMMIT;


-- ============================================================
-- VERIFICACION
-- ============================================================
-- Comprueba la multiplicacion contra lo que espera Lester.
SELECT
    e.full_name        AS empleado,
    c.role::text       AS rol,
    r.rate_value       AS tarifa_unidad,
    r.notes            AS unidad,
    CASE r.notes
        WHEN 'week'   THEN '2 unidades = ' || (r.rate_value * 2)::text
        WHEN 'period' THEN '1 unidad = '   || r.rate_value::text
        ELSE '(unidad sin definir)'
    END                AS ejemplo,
    CASE
        WHEN e.full_name = 'Yeline Munoz'         AND r.rate_value = 550  THEN 'OK'
        WHEN e.full_name = 'Carlos Ripoll'        AND r.rate_value = 1000 THEN 'OK'
        WHEN e.full_name = 'Oscar Acevedo'        AND r.rate_value = 850  THEN 'OK'
        WHEN e.full_name = 'Julio Castro Gallol'  AND r.rate_value = 1500 THEN 'OK'
        ELSE 'REVISAR'
    END                AS estado
FROM pay_role_rates r
JOIN pay_role_configs c ON c.id = r.pay_role_config_id
JOIN employees e        ON e.id = c.employee_id
WHERE c.active
  AND r.rate_key = 'FIXED_SALARY'
ORDER BY e.full_name;
