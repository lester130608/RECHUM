-- ============================================================
-- ¿DÓNDE ESTÁN LAS TARIFAS DE LA GENTE DE EMP?
-- 2026-08-31 (v2 — barre las cuatro fuentes)
-- ============================================================
-- La primera versión solo miró pay_role_rates y assignments.base_rate,
-- y salió casi todo vacío. Pero hay más sitios donde viven tarifas:
--
--   1) pay_rates              ← la usan BA y CMHC para calcular. Activa
--                                cuando valid_to IS NULL. Scoped por
--                                department + concept.
--   2) rate_cards             ← de la migración 0001. hourly/per_unit/flat
--   3) pay_role_rates         ← de la 0014. HOURLY/FIXED_SALARY/PERCENT
--   4) assignments.base_rate  ← la usan TCM y PSYQ
--
-- Devuelve UNA FILA POR TARIFA ENCONTRADA, de cualquier fuente.
-- Si una persona no aparece, no tiene tarifa en ningún sitio.
--
-- Una sola consulta: el editor de Supabase solo devuelve el último SELECT.
-- No modifica nada.
-- ============================================================

WITH gente_emp AS (
    SELECT DISTINCT e.id, COALESCE(e.full_name, e.first_name || ' ' || e.last_name) AS nombre
    FROM employees e
    LEFT JOIN assignments a ON a.employee_id = e.id AND a.department = 'EMP' AND a.active
    LEFT JOIN pay_role_configs c ON c.employee_id = e.id AND c.active
    WHERE a.employee_id IS NOT NULL
       OR c.role::text = 'OUTREACH'
       OR e.id IN (
           '46b56730-1184-46da-b399-8e5a0230f571',
           '6c9001ec-1002-428a-88c0-fb3dfd34aa53'
       )
)

SELECT * FROM (

    -- ── FUENTE 1: pay_rates ──────────────────────────────────
    SELECT
        g.nombre                     AS empleado,
        'pay_rates'                  AS fuente,
        pr.department                AS ambito,
        pr.concept                   AS concepto,
        pr.rate                      AS tarifa,
        CASE WHEN pr.valid_to IS NULL THEN 'activa' ELSE 'caducada ' || pr.valid_to::text END AS estado
    FROM gente_emp g
    JOIN pay_rates pr ON pr.employee_id = g.id

    UNION ALL

    -- ── FUENTE 2: rate_cards ─────────────────────────────────
    SELECT
        g.nombre,
        'rate_cards',
        rc.department,
        rc.service_code || ' (' || rc.pay_method || ')',
        rc.rate,
        CASE WHEN rc.active AND rc.effective_to IS NULL THEN 'activa' ELSE 'inactiva' END
    FROM gente_emp g
    JOIN rate_cards rc ON rc.worker_id = g.id

    UNION ALL

    -- ── FUENTE 3: pay_role_rates ─────────────────────────────
    SELECT
        g.nombre,
        'pay_role_rates',
        c.role::text || ' / ' || c.tax_type::text,
        r.rate_key || COALESCE(' -> ' || r.base_reference, ''),
        r.rate_value,
        CASE WHEN c.active THEN 'activa' ELSE 'inactiva' END
    FROM gente_emp g
    JOIN pay_role_configs c ON c.employee_id = g.id
    JOIN pay_role_rates r   ON r.pay_role_config_id = c.id

    UNION ALL

    -- ── FUENTE 4: assignments.base_rate ──────────────────────
    SELECT
        g.nombre,
        'assignments.base_rate',
        a.department,
        COALESCE(a.role, '(sin rol)'),
        a.base_rate,
        CASE WHEN a.active THEN 'activa' ELSE 'inactiva' END
    FROM gente_emp g
    JOIN assignments a ON a.employee_id = g.id
    WHERE a.base_rate IS NOT NULL

    UNION ALL

    -- ── Quien no aparece en NINGUNA fuente ───────────────────
    SELECT
        g.nombre,
        'NINGUNA',
        NULL, NULL, NULL,
        'sin tarifa en ningun sitio'
    FROM gente_emp g
    WHERE NOT EXISTS (SELECT 1 FROM pay_rates x WHERE x.employee_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM rate_cards x WHERE x.worker_id = g.id)
      AND NOT EXISTS (
          SELECT 1 FROM pay_role_configs c
          JOIN pay_role_rates r ON r.pay_role_config_id = c.id
          WHERE c.employee_id = g.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM assignments a
          WHERE a.employee_id = g.id AND a.base_rate IS NOT NULL
      )

) resultado
ORDER BY empleado, fuente, concepto;
