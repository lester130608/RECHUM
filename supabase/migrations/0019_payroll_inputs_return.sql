-- ============================================================
-- Migration 0019: devolver una captura al supervisor
-- Fecha: 2026-10-01
-- ============================================================
-- POR QUE
-- Cuando una supervisora envia su area con un error (P-20260905: en TCM
-- falto una persona), el owner tenia dos salidas: corregirlo el mismo desde
-- la captura, o un UPDATE a mano (DESBLOQUEAR_CAPTURA_BA.sql, 2026-09-01).
-- No habia forma de devolverselo a quien capturo para que lo arregle ella,
-- que es lo que deja el rastro mas limpio: corrige quien se equivoco.
--
-- QUE AÑADE
-- Tres columnas en payroll_inputs que describen la ultima devolucion. El
-- estado 'rejected' ya existia en el CHECK (0010) y nunca se usaba; ahora
-- significa "devuelta por el owner, pendiente de corregir".
--   returned_at    cuando se devolvio
--   returned_by    quien (el owner)
--   return_reason  motivo obligatorio, que ve la supervisora en pantalla
-- Al reenviar, la captura vuelve a 'review_ready' y estas columnas se
-- limpian. El historial completo queda en audit_logs
-- (action = 'return_to_supervisor').
--
-- No cambia politicas RLS: la supervisora ya puede editar su payroll_input
-- mientras el run este en 'draft' o 'review_ready', y el owner la devuelve
-- poniendo el run en 'draft'.
-- ============================================================

ALTER TABLE payroll_inputs
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS return_reason text;

COMMENT ON COLUMN payroll_inputs.return_reason IS
  'Motivo de la ultima devolucion al supervisor (status = rejected). Se limpia al reenviar.';
