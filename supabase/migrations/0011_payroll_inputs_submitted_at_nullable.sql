-- ============================================================
-- Migration 0011: permitir submitted_at NULL en borradores
-- Fecha: 2026-07-20
-- ============================================================
-- El flujo de captura guarda un borrador (status 'draft') con
-- submitted_at = NULL, porque todavía no se ha "enviado".
-- Pero la columna era NOT NULL (esquema original 0001), así que
-- el INSERT fallaba con "Failed to save input" al Guardar borrador.
--
-- Esta migración hace submitted_at opcional. Al enviar (Submit) el
-- código sigue poniendo la fecha; al guardar borrador queda NULL.
-- Es segura: no borra ni cambia datos existentes.
-- ============================================================

ALTER TABLE payroll_inputs
  ALTER COLUMN submitted_at DROP NOT NULL;

-- Verificación (opcional): 'submitted_at' debe salir con is_nullable = YES
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_inputs'
  AND column_name = 'submitted_at';
