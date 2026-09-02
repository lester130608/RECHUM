-- ============================================================
-- Por que Edwina sigue en Pending — 2026-09-01
-- ============================================================
-- Su 1.5% se calcula sobre los pay_run_items del run de BA
-- DEL MISMO PERIODO, filtrando por assignments.role = 'RBT'.
--
-- Dos causas posibles y muy distintas:
--   A) BA se aprobo pero el calculo nunca escribio items -> base 0
--   B) BA se aprobo en OTRO periodo distinto al de EMP -> no hay base
--
-- Una sola consulta. No modifica nada.
-- ============================================================

SELECT * FROM (

    -- ── 1 ── ESTADO DE CADA AREA, POR PERIODO ───────────────
    -- Si BA aparece aprobada pero con 0 items, es la causa A.
    SELECT
        1                                    AS orden,
        'AREA'                               AS seccion,
        pp.week_code                         AS campo_a,
        pr.area                              AS campo_b,
        pr.status                            AS campo_c,
        (SELECT COUNT(*)::text FROM pay_run_items pri WHERE pri.pay_run_id = pr.id)
          || ' items · '
          || COALESCE((SELECT SUM(pri.calc_total_amount)::text FROM pay_run_items pri
                       WHERE pri.pay_run_id = pr.id), '0') || ' $'  AS campo_d
    FROM pay_runs pr
    JOIN pay_periods pp ON pp.id = pr.period_id
    WHERE pr.run_level = 'area'
      AND pp.week_code IN ('P-20260808', 'P-20260822')

    UNION ALL

    -- ── 2 ── LA BASE QUE ENCONTRARIA EDWINA, POR PERIODO ────
    -- Replica exactamente lo que hace getBaseReferenceTotal:
    -- items del run de BA de ese periodo, solo empleados con
    -- assignments.role = 'RBT' en department 'BA'.
    SELECT
        2, 'BASE RBT', pp.week_code, 'RBT_TOTAL',
        COALESCE(SUM(pri.calc_total_amount), 0)::text || ' $',
        CASE
            WHEN COALESCE(SUM(pri.calc_total_amount), 0) > 0
                THEN 'Edwina cobraria ' ||
                     ROUND(COALESCE(SUM(pri.calc_total_amount), 0) * 0.015, 2)::text
            ELSE 'BASE CERO — Edwina se queda en Pending'
        END
    FROM pay_periods pp
    LEFT JOIN pay_runs pr      ON pr.period_id = pp.id AND pr.area = 'BA' AND pr.run_level = 'area'
    LEFT JOIN pay_run_items pri ON pri.pay_run_id = pr.id
    LEFT JOIN assignments a     ON a.employee_id = pri.worker_id
                               AND a.department = 'BA'
                               AND a.active
                               AND upper(a.role) = 'RBT'
    WHERE pp.week_code IN ('P-20260808', 'P-20260822')
      AND (a.employee_id IS NOT NULL OR pri.id IS NULL)
    GROUP BY pp.week_code

    UNION ALL

    -- ── 3 ── CUANTOS RBT ACTIVOS HAY EN BA ──────────────────
    -- Si sale 0, el filtro por rol es el problema, no el calculo.
    SELECT
        3, 'RBT ACTIVOS EN BA', upper(a.role), '',
        COUNT(*)::text || ' personas', ''
    FROM assignments a
    WHERE a.department = 'BA' AND a.active
    GROUP BY upper(a.role)

) r
ORDER BY orden, campo_a, campo_b;
