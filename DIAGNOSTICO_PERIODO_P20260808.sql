-- ============================================================
-- Que hay realmente en el periodo P-20260808 — 2026-09-01
-- ============================================================
-- Sintoma: la pantalla del owner muestra CMHC y EMP como
-- "Supervisor submitted" cuando solo se ha capturado BA.
--
-- Sospecha: datos de pruebas anteriores. Nunca llegamos a limpiar
-- el periodo, y en el proyecto hay constancia de filas de prueba
-- (las de department='PSYQ') que quedaron de sesiones pasadas.
--
-- Una sola consulta. No modifica nada.
-- ============================================================

SELECT * FROM (

    -- ── 1 ── RUNS del periodo, con quien y cuando ────────────
    SELECT
        1                                   AS orden,
        'RUN'                               AS seccion,
        pr.area                             AS campo_a,
        pr.status                           AS campo_b,
        pr.created_at::text                 AS campo_c,
        COALESCE(pr.last_calculated_at::text, 'nunca calculado') AS campo_d
    FROM pay_runs pr
    JOIN pay_periods pp ON pp.id = pr.period_id
    WHERE pp.week_code = 'P-20260808'
      AND pr.run_level = 'area'

    UNION ALL

    -- ── 2 ── CAPTURAS del periodo ────────────────────────────
    -- Si una captura es vieja o tiene payload vacio, es residuo.
    SELECT
        2, 'CAPTURA', pi.department, pi.status,
        COALESCE(pi.submitted_at::text, '(sin enviar)'),
        'payload con ' || (SELECT COUNT(*)::text FROM jsonb_object_keys(pi.payload)) || ' personas'
    FROM payroll_inputs pi
    JOIN pay_runs pr    ON pr.id = pi.pay_run_id
    JOIN pay_periods pp ON pp.id = pr.period_id
    WHERE pp.week_code = 'P-20260808'

    UNION ALL

    -- ── 3 ── ITEMS calculados por area ───────────────────────
    -- Si un area tiene 0 items, no se ha calculado de verdad.
    SELECT
        3, 'ITEMS CALCULADOS', pr.area,
        COUNT(pri.id)::text || ' items',
        COALESCE(SUM(pri.calc_total_amount), 0)::text || ' $',
        ''
    FROM pay_runs pr
    JOIN pay_periods pp ON pp.id = pr.period_id
    LEFT JOIN pay_run_items pri ON pri.pay_run_id = pr.id
    WHERE pp.week_code = 'P-20260808' AND pr.run_level = 'area'
    GROUP BY pr.area

    UNION ALL

    -- ── 4 ── CUANTA GENTE ACTIVA HAY POR AREA ────────────────
    -- Para contrastar con los "workers" que muestra la pantalla.
    SELECT
        4, 'PLANTILLA ACTIVA', a.department,
        COUNT(*)::text || ' personas', '', ''
    FROM assignments a
    WHERE a.active
    GROUP BY a.department

    UNION ALL

    -- ── 5 ── RESIDUOS DE PRUEBAS: capturas con department raro ─
    SELECT
        5, 'RESIDUO', pi.department, pi.status,
        COALESCE(pi.submitted_at::text, '(sin enviar)'),
        COALESCE(pp.week_code, '(sin periodo)')
    FROM payroll_inputs pi
    LEFT JOIN pay_runs pr    ON pr.id = pi.pay_run_id
    LEFT JOIN pay_periods pp ON pp.id = pr.period_id
    WHERE pi.department = 'PSYQ'

) r
ORDER BY orden, campo_a;
