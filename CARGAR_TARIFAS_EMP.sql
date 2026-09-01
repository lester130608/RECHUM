-- ============================================================
-- CARGA DE TARIFAS DE EMP — SEGUNDA TANDA
-- 2026-08-31
-- ============================================================
-- Ya cargados en la tanda anterior (no se tocan):
--   Eileen Avalos 27 · Dagmelys Rojas 33 · Lester Rojas 40
--   Dorelys Gordillo 35 · Jade Cairo 23 · Damarys Clement 42
--
-- ⚠️  CONFIRMA ANTES DE CORRER: dos importes se dieron por SEMANA y
--     aquí hacen falta POR PERIODO. Como el periodo es la quincena,
--     van multiplicados por 2 y la cuenta se deja escrita a la vista:
--
--       Yeline Munoz    550/semana  → 550 * 2 = 1100
--       Carlos Ripoll  1000/semana  → 1000 * 2 = 2000
--
--     Julio Castro Gayol (1500) y Oscar Acevedo (850) se dieron ya
--     por quincena, así que van tal cual, sin multiplicar.
--
-- Idempotente y transaccional.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. REQUISITO: la migración 0016 debe estar aplicada
-- ------------------------------------------------------------
-- Gabriela Rivas y Oscar Acevedo son EMPLOYEE / 1099. La restricción
-- original de la 0014 forzaba W2 en ese rol y los rechazaba. Si no se
-- ha aplicado la 0016, este bloque para aquí con un mensaje legible en
-- lugar de reventar más abajo con un error de constraint.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pay_role_configs_w2_only_roles'
          AND pg_get_constraintdef(oid) LIKE '%EMPLOYEE%'
    ) THEN
        RAISE EXCEPTION
          'Falta aplicar la migración 0016. El rol EMPLOYEE sigue forzado a W2 y '
          'Gabriela Rivas y Oscar Acevedo son 1099. Aplica primero '
          'supabase/migrations/0016_employee_role_allows_1099.sql y vuelve a correr esto.';
    END IF;
END $$;


-- ------------------------------------------------------------
-- 1. BAJAS LÓGICAS
-- ------------------------------------------------------------
-- Angela Peon se queda SOLO como TCM: se desactiva su asignación de
-- oficina, la de TCM no se toca.
UPDATE assignments a
SET active = false
FROM employees e
WHERE e.id = a.employee_id
  AND e.full_name = 'Angela Peon'
  AND a.department = 'EMP'
  AND a.active;

-- Marian Nieto ya no está en la empresa: se desactivan TODAS sus
-- asignaciones. Baja lógica, no borrado: su histórico de nóminas
-- (pay_runs, pay_run_items, pay_lines) se conserva intacto.
UPDATE assignments a
SET active = false
FROM employees e
WHERE e.id = a.employee_id
  AND e.full_name = 'Marian Nieto'
  AND a.active;


-- ------------------------------------------------------------
-- 2. OFICINA POR HORA — Gabriela Rivas
-- ------------------------------------------------------------
-- Gabriela es 1099. Requiere la migración 0016 aplicada: la 0014
-- forzaba W2 en el rol EMPLOYEE y esta fila sería rechazada.
WITH tarifas(nombre, tarifa_hora, tipo) AS (
    VALUES ('Gabriela Rivas', 23::numeric, '1099')
),
config_creada AS (
    INSERT INTO pay_role_configs (employee_id, role, tax_type, active, valid_from)
    SELECT e.id, 'EMPLOYEE'::pay_role_enum, t.tipo::tax_type_enum, true, CURRENT_DATE
    FROM tarifas t
    JOIN employees e ON e.full_name = t.nombre
    ON CONFLICT (employee_id, role) WHERE active
    DO UPDATE SET tax_type = EXCLUDED.tax_type, updated_at = now()
    RETURNING id, employee_id
)
INSERT INTO pay_role_rates (pay_role_config_id, rate_key, rate_value)
SELECT c.id, 'HOURLY', t.tarifa_hora
FROM config_creada c
JOIN employees e ON e.id = c.employee_id
JOIN tarifas t   ON t.nombre = e.full_name
ON CONFLICT (pay_role_config_id, rate_key)
DO UPDATE SET rate_value = EXCLUDED.rate_value, updated_at = now();


-- ------------------------------------------------------------
-- 3. OFICINA CON SALARIO FIJO — Yeline y Oscar
-- ------------------------------------------------------------
WITH tarifas(nombre, salario_periodo, tipo) AS (
    VALUES
        ('Yeline Munoz',  (550 * 2)::numeric, 'W2'),    -- 550/semana × 2 semanas
        ('Oscar Acevedo', 850::numeric,       '1099')   -- ya venía por quincena
),
config_creada AS (
    INSERT INTO pay_role_configs (employee_id, role, tax_type, active, valid_from)
    SELECT e.id, 'EMPLOYEE'::pay_role_enum, t.tipo::tax_type_enum, true, CURRENT_DATE
    FROM tarifas t
    JOIN employees e ON e.full_name = t.nombre
    ON CONFLICT (employee_id, role) WHERE active
    DO UPDATE SET tax_type = EXCLUDED.tax_type, updated_at = now()
    RETURNING id, employee_id
)
INSERT INTO pay_role_rates (pay_role_config_id, rate_key, rate_value)
SELECT c.id, 'FIXED_SALARY', t.salario_periodo
FROM config_creada c
JOIN employees e ON e.id = c.employee_id
JOIN tarifas t   ON t.nombre = e.full_name
ON CONFLICT (pay_role_config_id, rate_key)
DO UPDATE SET rate_value = EXCLUDED.rate_value, updated_at = now();


-- ------------------------------------------------------------
-- 4. PSIQUIATRAS — salario fijo del periodo, rol DOCTOR
-- ------------------------------------------------------------
-- Si alguno es 1099 en vez de W2, cámbialo en su fila.
WITH tarifas(nombre, salario_periodo, tipo) AS (
    VALUES
        ('Carlos Ripoll',       (1000 * 2)::numeric, '1099'),  -- 1000/semana × 2
        ('Julio Castro Gallol', 1500::numeric,       '1099')   -- ya por quincena
),
config_creada AS (
    INSERT INTO pay_role_configs (employee_id, role, tax_type, active, valid_from)
    SELECT e.id, 'DOCTOR'::pay_role_enum, t.tipo::tax_type_enum, true, CURRENT_DATE
    FROM tarifas t
    JOIN employees e ON e.full_name = t.nombre
    ON CONFLICT (employee_id, role) WHERE active
    DO UPDATE SET tax_type = EXCLUDED.tax_type, updated_at = now()
    RETURNING id, employee_id
)
INSERT INTO pay_role_rates (pay_role_config_id, rate_key, rate_value)
SELECT c.id, 'FIXED_SALARY', t.salario_periodo
FROM config_creada c
JOIN employees e ON e.id = c.employee_id
JOIN tarifas t   ON t.nombre = e.full_name
ON CONFLICT (pay_role_config_id, rate_key)
DO UPDATE SET rate_value = EXCLUDED.rate_value, updated_at = now();


COMMIT;


-- ============================================================
-- QUÉ QUEDÓ CARGADO EN EMP
-- ============================================================
SELECT
    e.full_name       AS empleado,
    c.role::text      AS rol,
    c.tax_type::text  AS tipo,
    r.rate_key        AS forma_de_pago,
    r.rate_value      AS importe
FROM pay_role_configs c
JOIN employees e      ON e.id = c.employee_id
JOIN pay_role_rates r ON r.pay_role_config_id = c.id
WHERE c.active
  AND c.role::text IN ('EMPLOYEE', 'DOCTOR', 'OUTREACH')
  AND r.rate_key IN ('HOURLY', 'FIXED_SALARY', 'PERCENT')
ORDER BY r.rate_key, e.full_name;


-- ============================================================
-- ¿QUEDA ALGUIEN SIN TARIFA?
-- Esta vez debe salir VACÍO.
-- ============================================================
SELECT COALESCE(e.full_name, e.first_name || ' ' || e.last_name) AS sin_tarifa_emp
FROM employees e
JOIN assignments a ON a.employee_id = e.id AND a.department = 'EMP' AND a.active
WHERE NOT EXISTS (
    SELECT 1 FROM pay_role_configs c
    JOIN pay_role_rates r ON r.pay_role_config_id = c.id
    WHERE c.employee_id = e.id AND c.active
      AND r.rate_key IN ('HOURLY', 'FIXED_SALARY')
)
AND NOT EXISTS (
    SELECT 1 FROM pay_role_configs c2
    WHERE c2.employee_id = e.id AND c2.active AND c2.role::text = 'OUTREACH'
)
ORDER BY 1;
