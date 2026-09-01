-- ============================================================
-- Migration 0015: restringir la lectura de retribuciones
-- Fecha: 2026-08-30
-- ============================================================
-- PROBLEMA (introducido por la propia 0014)
-- La 0014 copió el patrón de RLS de pay_runs (migración 0001), que
-- concede SELECT a owner, admin, hr, supervisor y ba. Ese reparto es
-- razonable para los metadatos de un run, pero NO para pay_role_rates,
-- que contiene la tarifa de cada empleado.
--
-- Las políticas PERMISSIVE se combinan con OR, así que el efecto neto
-- era que un supervisor de BA podía leer las retribuciones de toda la
-- plantilla consultando la tabla directamente.
--
-- Eso contradice la intención explícita de la aplicación:
-- lib/payrollVisibility.ts → redactPayrollMoneyForRole() elimina los
-- campos 'rate', 'amount', 'calc_total_amount' y similares para todo
-- el que no sea owner. Pero esa función solo protege las respuestas de
-- la API; un supervisor con su propio token puede consultar la tabla
-- por su cuenta y saltársela. RLS es la capa que de verdad manda.
--
-- SOLUCIÓN
-- Reducir el SELECT a owner, admin y hr en ambas tablas.
--
-- Verificado antes de aplicar: las rutas que leen estas tablas son
-- app/api/pay-config/*, app/api/payroll/emp/[pay_period_id],
-- app/api/payroll/owner/office-capture y owner/consolidated. Todas
-- exigen permiso 'manage_employees' o rol owner. Ninguna pantalla de
-- supervisor las consulta: las capturas de BA y TCM leen 'assignments'.
-- Estrechar esto no rompe ningún flujo existente.
--
-- Las políticas preexistentes (pay_role_configs_owner_all y
-- pay_role_rates_owner_all) no se tocan: verifican el permiso
-- 'manage_employees' vía role_permissions y son correctas.
-- ============================================================

-- ------------------------------------------------------------
-- pay_role_configs — rol y tax_type
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Payroll roles can view pay role configs" ON pay_role_configs;

CREATE POLICY "Payroll roles can view pay role configs" ON pay_role_configs
FOR SELECT USING (
    current_user_has_any_role(ARRAY['owner', 'admin', 'hr'])
);

-- ------------------------------------------------------------
-- pay_role_rates — las tarifas. El dato sensible.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Payroll roles can view pay role rates" ON pay_role_rates;

CREATE POLICY "Payroll roles can view pay role rates" ON pay_role_rates
FOR SELECT USING (
    current_user_has_any_role(ARRAY['owner', 'admin', 'hr'])
);

-- ============================================================
-- VERIFICACIÓN
-- Ninguna fila debe mencionar 'supervisor' ni 'ba'.
-- ============================================================
SELECT
    tablename AS tabla,
    policyname AS politica,
    cmd AS operacion,
    qual AS condicion,
    CASE
        WHEN qual LIKE '%supervisor%' OR qual LIKE '%''ba''%'
            THEN 'REVISAR — todavia expone tarifas'
        ELSE 'OK'
    END AS estado
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pay_role_configs', 'pay_role_rates')
ORDER BY tablename, cmd, policyname;
