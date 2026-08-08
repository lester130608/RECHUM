-- ============================================================
-- Migration 0013: permitir department = 'EMP' en payroll_inputs
-- Fecha: 2026-08-07
-- ============================================================
-- PROBLEMA
-- La migración 0009 agregó 'EMP' al CHECK de pay_runs.area, pero
-- NO tocó payroll_inputs.department, que sigue con el CHECK original
-- de la migración 0001:
--
--   CHECK (department IN ('BA', 'TCM', 'CMHC', 'PSYQ'))
--
-- Sin embargo, app/api/payroll/owner/office-capture/route.ts escribe
-- payroll_inputs con department = 'EMP' (constante OFFICE_INPUT_DEPARTMENT).
--
-- Resultado: la captura de EMP falla contra la base con violación de
-- CHECK, incluso después de aplicar 0009. El bug está oculto porque
-- 0009 nunca se aplicó, así que EMP falla antes por otro motivo.
--
-- SOLUCIÓN
-- Ampliar el CHECK para aceptar 'EMP', conservando los valores
-- existentes. Aditiva y segura: no borra ni modifica datos.
--
-- Nota: las políticas RLS de 0008 comparan pr.area = payroll_inputs.department,
-- así que ambos lados deben aceptar 'EMP' para que EMP funcione. Con 0009
-- (pay_runs.area) + esta 0013 (payroll_inputs.department) queda completo.
--
-- IMPORTANTE: aplicar DESPUÉS de 0009.
-- ============================================================

ALTER TABLE payroll_inputs
  DROP CONSTRAINT IF EXISTS payroll_inputs_department_check;

ALTER TABLE payroll_inputs
  ADD CONSTRAINT payroll_inputs_department_check
  CHECK (department IN ('BA', 'TCM', 'CMHC', 'PSYQ', 'EMP'));

-- ------------------------------------------------------------
-- Verificación: debe mostrar el CHECK con los 5 valores.
-- ------------------------------------------------------------
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'payroll_inputs'::regclass
  AND contype = 'c'
  AND conname LIKE '%department%';
