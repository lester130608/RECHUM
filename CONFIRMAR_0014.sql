-- ============================================================
-- POLÍTICAS RLS DE pay_role_configs / pay_role_rates
-- ============================================================
-- La migración 0014 creó 2 políticas por tabla, pero hay 3.
-- La tercera es preexistente (las tablas se crearon fuera del
-- historial de migraciones).
--
-- IMPORTANTE: las políticas PERMISSIVE se combinan con OR. Una sola
-- política permisiva amplia (USING true, o sin filtro de rol) anula
-- el efecto de las otras dos. Estas tablas contienen retribuciones.
--
-- Qué buscar en el resultado:
--   · permissive = PERMISSIVE y condicion = 'true'  → problema
--   · roles = {public} o {authenticated} sin más filtro → problema
--   · las dos de la 0014 llaman a current_user_has_any_role(...)
-- ============================================================

SELECT
    tablename    AS tabla,
    policyname   AS politica,
    permissive,
    roles,
    cmd          AS operacion,
    COALESCE(qual, '(sin USING)')        AS condicion_using,
    COALESCE(with_check, '(sin CHECK)')  AS condicion_check,
    CASE
        WHEN qual = 'true' OR with_check = 'true'
            THEN 'REVISAR — condicion abierta'
        WHEN policyname LIKE '%pay role%'
            THEN 'de la migracion 0014'
        ELSE 'preexistente — revisar'
    END AS origen
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pay_role_configs', 'pay_role_rates')
ORDER BY tablename, cmd, policyname;
