-- ============================================================
-- DIAGNÓSTICO 4 — UNA SOLA CONSULTA
-- 2026-08-30
-- ============================================================
-- El editor de Supabase solo devuelve el resultado del último SELECT
-- cuando se corren varios. Esto es un único SELECT que devuelve las
-- cuatro respuestas que faltan en una sola tabla.
--
-- Correr entero. No modifica nada.
-- ============================================================

SELECT * FROM (

    -- ── 1 ── valores de los enum ─────────────────────────────
    SELECT
        1                AS orden,
        'ENUM'           AS seccion,
        t.typname        AS campo_a,
        string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS campo_b,
        NULL::text       AS campo_c,
        NULL::text       AS campo_d
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname

    UNION ALL

    -- ── 2 ── configuración OUTREACH / PERCENT (Edwina) ───────
    SELECT
        2,
        'OUTREACH',
        COALESCE(e.full_name, '(sin empleado)'),
        c.role::text || ' / ' || c.tax_type::text ||
            CASE WHEN c.active THEN ' / activa' ELSE ' / INACTIVA' END,
        COALESCE(r.rate_key, '(sin tarifa)') || ' = ' || COALESCE(r.rate_value::text, '-'),
        COALESCE(r.base_reference, '(SIN BASE)')
    FROM pay_role_configs c
    LEFT JOIN employees e ON e.id = c.employee_id
    LEFT JOIN pay_role_rates r ON r.pay_role_config_id = c.id
    WHERE r.rate_key = 'PERCENT' OR c.role::text = 'OUTREACH'

    UNION ALL

    -- Si la sección OUTREACH no aparece arriba, esta fila lo dice:
    SELECT
        2,
        'OUTREACH',
        '(NO HAY NINGUNA CONFIG OUTREACH NI PERCENT)',
        NULL, NULL, NULL
    WHERE NOT EXISTS (
        SELECT 1 FROM pay_role_configs c
        LEFT JOIN pay_role_rates r ON r.pay_role_config_id = c.id
        WHERE r.rate_key = 'PERCENT' OR c.role::text = 'OUTREACH'
    )

    UNION ALL

    -- ── 3 ── ¿payroll_module_status tiene datos? ─────────────
    -- Decide si mi cambio en el módulo EMP es correcto o hay que revertirlo.
    SELECT
        3,
        'MODULE_STATUS',
        'payroll_module_status',
        (SELECT COUNT(*) FROM payroll_module_status)::text || ' filas',
        (SELECT COUNT(*) FROM payroll_emp_module_status)::text || ' filas en emp_module_status',
        (SELECT COUNT(*) FROM pay_runs WHERE run_level = 'area')::text || ' runs de area'

    UNION ALL

    -- ── 4 ── filas que rompen la regla W2 ────────────────────
    SELECT
        4,
        'VIOLA_W2',
        COALESCE(e.full_name, '(sin empleado)'),
        c.role::text,
        c.tax_type::text,
        CASE WHEN c.active THEN 'activa' ELSE 'inactiva' END
    FROM pay_role_configs c
    LEFT JOIN employees e ON e.id = c.employee_id
    WHERE c.role::text IN ('RBT', 'BCABA', 'EMPLOYEE', 'OUTREACH')
      AND c.tax_type::text <> 'W2'

    UNION ALL

    -- Si no hay violaciones, se dice explícitamente:
    SELECT
        4,
        'VIOLA_W2',
        '(ninguna: el CHECK se puede validar sin limpiar nada)',
        NULL, NULL, NULL
    WHERE NOT EXISTS (
        SELECT 1 FROM pay_role_configs c
        WHERE c.role::text IN ('RBT', 'BCABA', 'EMPLOYEE', 'OUTREACH')
          AND c.tax_type::text <> 'W2'
    )

    UNION ALL

    -- ── 5 ── cuántas configs hay en total ────────────────────
    SELECT
        5,
        'RESUMEN_CONFIGS',
        c.role::text,
        c.tax_type::text,
        CASE WHEN c.active THEN 'activa' ELSE 'inactiva' END,
        COUNT(*)::text || ' filas'
    FROM pay_role_configs c
    GROUP BY c.role::text, c.tax_type::text, c.active

) resultado
ORDER BY orden, campo_a, campo_b;
