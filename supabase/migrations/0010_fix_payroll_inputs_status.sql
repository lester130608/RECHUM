-- ============================================================
-- Migration 0010: permitir estados del flujo de dos capas en payroll_inputs
-- Fecha: 2026-07-20
-- ============================================================
-- El flujo de captura (BA/CMHC/TCM) guarda payroll_inputs con:
--   status = 'draft'        (Guardar borrador)
--   status = 'review_ready' (Enviar para aprobación)
-- Pero el CHECK original (migración 0001) solo permitía
--   ('submitted', 'validated', 'rejected')
-- por lo que la base de datos rechazaba el guardado ("Save Draft").
--
-- Esta migración amplía el CHECK para aceptar los estados nuevos,
-- conservando los antiguos para no invalidar filas existentes.
-- Es segura: no borra datos.
-- ============================================================

ALTER TABLE payroll_inputs
  DROP CONSTRAINT IF EXISTS payroll_inputs_status_check;

ALTER TABLE payroll_inputs
  ADD CONSTRAINT payroll_inputs_status_check
  CHECK (status IN ('draft', 'review_ready', 'submitted', 'validated', 'rejected'));

-- Verificación (opcional): debe mostrar el nuevo CHECK con los 5 estados.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'payroll_inputs'::regclass
  AND contype = 'c';
