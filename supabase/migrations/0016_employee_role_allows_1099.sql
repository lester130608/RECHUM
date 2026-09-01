-- ============================================================
-- Migration 0016: el rol EMPLOYEE admite 1099
-- Fecha: 2026-08-31
-- ============================================================
-- PROBLEMA
-- La migración 0014 llevó a la base la regla de lib/pay-config.ts
-- (ROLE_TAX_RULES), que declaraba EMPLOYEE como W2 obligatorio:
--
--   CHECK (NOT active
--          OR role NOT IN ('RBT','BCABA','EMPLOYEE','OUTREACH')
--          OR tax_type = 'W2')
--
-- Esa regla es incorrecta. Hay personal de oficina contratado como
-- 1099 (Gabriela Rivas, Oscar Acevedo), confirmado por Lester el
-- 2026-08-31. La restricción impediría darlos de alta.
--
-- Es el mismo patrón que ya corregimos dos veces esta semana: una
-- suposición del código convertida en verdad sin contrastarla con
-- los datos reales.
--
-- SOLUCIÓN
-- Sacar EMPLOYEE de la lista de roles W2-only. RBT, BCABA y OUTREACH
-- se mantienen: no hay ningún caso que contradiga esa parte.
--
-- lib/pay-config.ts se actualiza en el mismo commit para que la capa
-- de aplicación y la base digan lo mismo.
-- ============================================================

ALTER TABLE pay_role_configs
  DROP CONSTRAINT IF EXISTS pay_role_configs_w2_only_roles;

ALTER TABLE pay_role_configs
  ADD CONSTRAINT pay_role_configs_w2_only_roles
  CHECK (
      NOT active
      OR role::text NOT IN ('RBT', 'BCABA', 'OUTREACH')
      OR tax_type::text = 'W2'
  );

-- Se valida de inmediato: la restricción es más permisiva que la
-- anterior, así que cualquier fila que pasara antes pasa ahora.
ALTER TABLE pay_role_configs VALIDATE CONSTRAINT pay_role_configs_w2_only_roles;


-- ============================================================
-- VERIFICACIÓN — 'EMPLOYEE' NO debe aparecer en la definición
-- ============================================================
SELECT
    conname AS restriccion,
    CASE WHEN pg_get_constraintdef(oid) LIKE '%EMPLOYEE%'
         THEN 'REVISAR — sigue forzando W2 en EMPLOYEE'
         ELSE 'OK — EMPLOYEE admite 1099' END AS estado,
    convalidated AS validada,
    pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conname = 'pay_role_configs_w2_only_roles';
