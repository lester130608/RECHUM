-- ============================================================
-- Por que falla crear empleados — 2026-09-01
-- ============================================================
-- Sintomas:
--   supervisor_ba → "Failed to create employee"        (falla employees)
--   owner         → "Employee created but assignment failed" (falla assignments)
--
-- Que falle assignments SIENDO OWNER descarta permisos: el owner ya
-- tiene manage_assignments. Apunta a que la ruta inserta columnas que
-- no existen. Manda estas: employee_id, department, role, tax_type,
-- adp_pay_mode, base_rate, active.
--
-- Una sola consulta. No modifica nada.
-- ============================================================

SELECT * FROM (

    -- ── 1 ── COLUMNAS REALES DE assignments ──────────────────
    -- Comparar con la lista de arriba. Si falta tax_type o
    -- adp_pay_mode, ese es el fallo y no hay que tocar permisos.
    SELECT
        1                        AS orden,
        'COLUMNA assignments'    AS seccion,
        column_name::text        AS campo_a,
        data_type::text          AS campo_b,
        (CASE WHEN is_nullable = 'NO' THEN 'NOT NULL' ELSE 'admite null' END)
          || COALESCE(' · default ' || column_default, '') AS campo_c
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments'

    UNION ALL

    -- ── 2 ── CHECKS de assignments ───────────────────────────
    SELECT
        2, 'CHECK assignments', conname::text, '',
        pg_get_constraintdef(oid)::text
    FROM pg_constraint
    WHERE conrelid = 'assignments'::regclass AND contype = 'c'

    UNION ALL

    -- ── 3 ── POLITICAS de employees ──────────────────────────
    -- Esto explica por que el supervisor no pasa de la primera insercion.
    SELECT
        3, 'POLITICA employees', policyname::text, cmd::text,
        COALESCE(qual, with_check, '(sin condicion)')::text
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employees'

    UNION ALL

    -- ── 4 ── POLITICAS de assignments ────────────────────────
    SELECT
        4, 'POLITICA assignments', policyname::text, cmd::text,
        COALESCE(qual, with_check, '(sin condicion)')::text
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assignments'

    UNION ALL

    -- ── 5 ── EMPLEADOS HUERFANOS ─────────────────────────────
    -- Creados hoy sin llegar a tener asignacion. Hay que limpiarlos:
    -- no aparecen en ninguna captura pero ocupan la tabla.
    SELECT
        5, 'HUERFANO (sin asignacion)',
        COALESCE(e.full_name, e.first_name || ' ' || e.last_name)::text,
        e.email::text,
        e.created_at::text
    FROM employees e
    WHERE NOT EXISTS (SELECT 1 FROM assignments a WHERE a.employee_id = e.id)
      AND e.created_at::date = CURRENT_DATE

    UNION ALL

    -- ── 6 ── PERMISOS de supervisor_ba ───────────────────────
    SELECT
        6, 'PERMISO supervisor_ba', p.code::text, '', ''
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p       ON p.id = rp.permission_id
    WHERE r.code = 'supervisor_ba'

) r
ORDER BY orden, campo_a;
