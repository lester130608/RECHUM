-- ============================================================
-- Migration 0014: pay_role_configs + pay_role_rates
-- Fecha: 2026-08-30
-- ============================================================
-- PROBLEMA
-- Existe un módulo completo de configuración de pago —tipos
-- (lib/types/pay-config.ts), validación (lib/pay-config.ts), API
-- (app/api/pay-config/*) y pantalla de admin
-- (app/admin/pay-configuration/[employee_id])— construido contra dos
-- tablas que NUNCA se crearon en ninguna migración:
--
--     pay_role_configs
--     pay_role_rates
--
-- Consecuencias medidas en el código actual:
--
--   1. lib/owner-view.ts → calculateOutreachAmount() lee pay_role_configs
--      para localizar a los RBT. El select falla, la función atrapa el
--      error y hace `return 0`. El 1.5% de Edwina Fernandez sale en CERO
--      sin ningún aviso: un fallo de esquema convertido en una cifra de
--      nómina aparentemente válida.
--
--   2. app/api/payroll/owner/consolidated/[pay_period_id] construye la
--      vista por empleado desde estas tablas. Las líneas de OUTREACH no
--      se generan nunca porque el select a pay_role_configs falla y el
--      bucle no llega a ejecutarse.
--
--   3. app/api/payroll/emp/[pay_period_id] lee pay_role_rates para
--      distinguir HOURLY / FIXED_SALARY / PERCENT en la captura de
--      oficina.
--
-- SOLUCIÓN
-- Crear las dos tablas con exactamente la forma que el código ya espera
-- (ver el select de app/api/pay-config/[employee_id]/route.ts:44-72).
-- Aditiva: no toca datos ni tablas existentes.
--
-- Con esto, además, la pantalla /admin/pay-configuration/[employee_id]
-- pasa a funcionar, y el porcentaje de Edwina queda editable desde la UI
-- en vez de estar fijado en el código.
-- ============================================================

-- ------------------------------------------------------------
-- 1. pay_role_configs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_role_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN (
        'EMPLOYEE', 'TCM', 'RBT', 'BCABA', 'BCBA', 'THERAPIST', 'DOCTOR', 'OUTREACH'
    )),
    tax_type text NOT NULL DEFAULT 'W2' CHECK (tax_type IN ('W2', '1099')),
    active boolean NOT NULL DEFAULT true,
    valid_from date NOT NULL DEFAULT CURRENT_DATE,
    valid_to date,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- La tabla ya existía en la base fuera del historial de migraciones, así
-- que el CREATE de arriba pudo no haber hecho nada. Estas columnas son las
-- que el código selecciona en app/api/pay-config/[employee_id]/route.ts:44-72;
-- se añaden solo si faltan. Aditivo y seguro de correr varias veces.
ALTER TABLE pay_role_configs
  ADD COLUMN IF NOT EXISTS tax_type   text NOT NULL DEFAULT 'W2',
  ADD COLUMN IF NOT EXISTS active     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS valid_to   date,
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Regla de negocio de lib/pay-config.ts (ROLE_TAX_RULES): estos roles
-- son W2 obligatoriamente. Se replica en la base para que la restricción
-- no dependa solo de la capa de aplicación.
--
-- Solo se aplica a configuraciones ACTIVAS. Diagnóstico del 2026-08-30:
-- la única fila que violaba la regla era una config histórica e inactiva
-- (Abdel Suarez, EMPLOYEE/1099). Invalidar retroactivamente un registro
-- histórico no aporta nada y sí impediría validar la restricción.
--
-- role y tax_type son ENUM en la base viva, no text. El cast a ::text hace
-- que el CHECK funcione igual con enum o con text, y evita fallar si algún
-- literal no existiera como valor del enum.
ALTER TABLE pay_role_configs
  DROP CONSTRAINT IF EXISTS pay_role_configs_w2_only_roles;

ALTER TABLE pay_role_configs
  ADD CONSTRAINT pay_role_configs_w2_only_roles
  CHECK (
      NOT active
      OR role::text NOT IN ('RBT', 'BCABA', 'EMPLOYEE', 'OUTREACH')
      OR tax_type::text = 'W2'
  ) NOT VALID;

-- La API (route.ts:139-152) asume que solo puede haber UNA config activa
-- por empleado y rol, y devuelve 409 si ya existe.
--
-- Se crea solo si los datos actuales lo permiten. Si hay duplicados, la
-- migración NO falla: avisa y sigue, para que puedas limpiarlos y volver
-- a correrla. Un índice único que revienta a mitad de migración deja el
-- esquema a medias, que es peor que no tenerlo.
DO $$
DECLARE
    duplicados integer;
BEGIN
    SELECT COUNT(*) INTO duplicados
    FROM (
        SELECT employee_id, role
        FROM pay_role_configs
        WHERE active
        GROUP BY employee_id, role
        HAVING COUNT(*) > 1
    ) d;

    IF duplicados > 0 THEN
        RAISE WARNING
          'pay_role_configs: % combinaciones (employee_id, role) activas duplicadas. '
          'No se creó el índice único. Límpialas y vuelve a correr esta migración.',
          duplicados;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS pay_role_configs_one_active_per_role
          ON pay_role_configs (employee_id, role)
          WHERE active;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS pay_role_configs_employee_idx
  ON pay_role_configs (employee_id);

CREATE INDEX IF NOT EXISTS pay_role_configs_role_active_idx
  ON pay_role_configs (role) WHERE active;

-- ------------------------------------------------------------
-- 2. pay_role_rates
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_role_rates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pay_role_config_id uuid NOT NULL REFERENCES pay_role_configs(id) ON DELETE CASCADE,
    rate_key text NOT NULL,
    rate_value numeric NOT NULL,
    base_reference text CHECK (base_reference IS NULL OR base_reference IN (
        'BA_TOTAL', 'CMHC_TOTAL', 'TCM_TOTAL', 'EMP_TOTAL', 'ALL_TOTAL',
        'RBT_TOTAL', 'BCABA_TOTAL', 'BCBA_TOTAL', 'THERAPIST_TOTAL',
        'EMPLOYEE_TOTAL', 'DOCTOR_TOTAL', 'OUTREACH_TOTAL'
    )),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pay_role_config_id, rate_key)
);

-- Mismo criterio defensivo que en pay_role_configs.
ALTER TABLE pay_role_rates
  ADD COLUMN IF NOT EXISTS base_reference text,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS pay_role_rates_config_idx
  ON pay_role_rates (pay_role_config_id);

-- La tabla ya existía sin validación de base_reference, así que el CHECK
-- del CREATE TABLE de arriba nunca llegó a aplicarse. Se añade aquí.
ALTER TABLE pay_role_rates
  DROP CONSTRAINT IF EXISTS pay_role_rates_base_reference_valid;

ALTER TABLE pay_role_rates
  ADD CONSTRAINT pay_role_rates_base_reference_valid
  CHECK (base_reference IS NULL OR base_reference IN (
      'BA_TOTAL', 'CMHC_TOTAL', 'TCM_TOTAL', 'EMP_TOTAL', 'ALL_TOTAL',
      'RBT_TOTAL', 'BCABA_TOTAL', 'BCBA_TOTAL', 'THERAPIST_TOTAL',
      'EMPLOYEE_TOTAL', 'DOCTOR_TOTAL', 'OUTREACH_TOTAL'
  )) NOT VALID;

-- Una tarifa PERCENT sin base de cálculo es exactamente el bug que
-- estamos cerrando: un porcentaje que no sabe sobre qué aplicarse.
-- NOT VALID por el mismo motivo que arriba: la tabla puede traer datos.
ALTER TABLE pay_role_rates
  DROP CONSTRAINT IF EXISTS pay_role_rates_percent_needs_base;

ALTER TABLE pay_role_rates
  ADD CONSTRAINT pay_role_rates_percent_needs_base
  CHECK (rate_key <> 'PERCENT' OR base_reference IS NOT NULL) NOT VALID;

-- ------------------------------------------------------------
-- 3. updated_at automático
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pay_role_configs_set_updated_at ON pay_role_configs;
CREATE TRIGGER pay_role_configs_set_updated_at
  BEFORE UPDATE ON pay_role_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS pay_role_rates_set_updated_at ON pay_role_rates;
CREATE TRIGGER pay_role_rates_set_updated_at
  BEFORE UPDATE ON pay_role_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 4. RLS
-- Mismo criterio que pay_runs en 0001: lectura para los roles de
-- nómina, escritura solo owner/admin. Son datos de retribución.
-- ------------------------------------------------------------
ALTER TABLE pay_role_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_role_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll roles can view pay role configs" ON pay_role_configs;
CREATE POLICY "Payroll roles can view pay role configs" ON pay_role_configs
FOR SELECT USING (
    current_user_has_any_role(ARRAY['owner', 'admin', 'hr', 'supervisor', 'ba'])
);

DROP POLICY IF EXISTS "Owner admin can write pay role configs" ON pay_role_configs;
CREATE POLICY "Owner admin can write pay role configs" ON pay_role_configs
FOR ALL USING (
    current_user_has_any_role(ARRAY['owner', 'admin'])
) WITH CHECK (
    current_user_has_any_role(ARRAY['owner', 'admin'])
);

DROP POLICY IF EXISTS "Payroll roles can view pay role rates" ON pay_role_rates;
CREATE POLICY "Payroll roles can view pay role rates" ON pay_role_rates
FOR SELECT USING (
    current_user_has_any_role(ARRAY['owner', 'admin', 'hr', 'supervisor', 'ba'])
);

DROP POLICY IF EXISTS "Owner admin can write pay role rates" ON pay_role_rates;
CREATE POLICY "Owner admin can write pay role rates" ON pay_role_rates
FOR ALL USING (
    current_user_has_any_role(ARRAY['owner', 'admin'])
) WITH CHECK (
    current_user_has_any_role(ARRAY['owner', 'admin'])
);

-- ------------------------------------------------------------
-- 5. Validar las restricciones contra los datos existentes
--
-- Se añadieron NOT VALID para que la migración no pudiera fallar a
-- mitad. Los datos del 2026-08-30 ya las cumplen todas, así que se
-- validan aquí mismo y pasan a aplicarse también a las filas antiguas.
--
-- Si alguna de estas tres falla, la migración se detiene y el mensaje
-- dice exactamente qué restricción y qué tabla: es información útil,
-- no un accidente. El esquema ya quedó creado en los pasos anteriores.
-- ------------------------------------------------------------
ALTER TABLE pay_role_configs VALIDATE CONSTRAINT pay_role_configs_w2_only_roles;
ALTER TABLE pay_role_rates   VALIDATE CONSTRAINT pay_role_rates_base_reference_valid;
ALTER TABLE pay_role_rates   VALIDATE CONSTRAINT pay_role_rates_percent_needs_base;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('pay_role_configs', 'pay_role_rates')
ORDER BY table_name, ordinal_position;

-- ============================================================
-- ESTADO VERIFICADO (2026-08-30)
--
-- Edwina Fernandez YA está configurada correctamente:
--   OUTREACH / W2 / activa, PERCENT = 1.5000, base RBT_TOTAL
-- Sus datos nunca fueron el problema. El 1.5% salía en cero porque
-- calculateOutreachAmount leía payroll_ba_entries, tabla inexistente.
-- Eso ya está corregido en lib/owner-view.ts.
--
-- PENDIENTE (datos, no esquema — no lo hace esta migración):
--   Solo 7 empleados tienen pay_role_config, frente a 11 runs de área.
--   Los que no la tengan aparecerán en la vista consolidada con el rol
--   por defecto de su área y tax_type='W2'. Para el export a ADP eso
--   importa: un 1099 sin config se trataría como W2.
--   Darlos de alta desde /admin/pay-configuration/[employee_id].
-- ============================================================
