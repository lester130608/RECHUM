-- ============================================================
-- Migration 0018: cada usuario puede leer SUS propias entradas de audit_logs
-- ============================================================
-- POR QUE
-- El asistente lleva un tope de preguntas por persona y dia, y lo cuenta sobre
-- audit_logs, que es donde ya queda el rastro de cada pregunta. Con la politica
-- de 0008, SELECT sobre audit_logs es solo del owner, asi que para un supervisor
-- la cuenta siempre daba cero y el tope no se aplicaba justo a quien deberia.
--
-- ALCANCE
-- Solo sus propias filas (actor_id = auth.uid()). El resto del log sigue siendo
-- del owner. No se toca la politica de INSERT ni la de SELECT del owner.
-- ============================================================

DROP POLICY IF EXISTS audit_logs_select_own ON audit_logs;

CREATE POLICY audit_logs_select_own ON audit_logs
FOR SELECT TO authenticated
USING (actor_id = auth.uid());
