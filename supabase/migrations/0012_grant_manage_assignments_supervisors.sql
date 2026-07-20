-- ============================================================
-- Migration 0012: otorgar 'manage_assignments' a los supervisores
-- Fecha: 2026-07-20
-- ============================================================
-- La tabla 'assignments' exige el permiso 'manage_assignments'
-- (RLS: current_user_has_permission('manage_assignments')).
-- Hoy solo el rol 'owner' lo tiene, por eso los supervisores no
-- pueden activar/desactivar empleados de su área.
--
-- Esta migración concede ese permiso a supervisor_ba, supervisor_cmhc
-- y supervisor_tcm. Es idempotente (no duplica si ya existe) y segura.
--
-- Nota de seguridad: este permiso no está limitado por área a nivel
-- de base de datos; el límite por departamento lo aplica la API
-- (canManageArea en /api/payroll/employees). Es el mismo patrón que
-- ya usa el resto del sistema.
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, '75a6fdf5-7f41-480a-8509-516e7d5e6b3d'::uuid  -- manage_assignments
FROM roles r
WHERE r.code IN ('supervisor_ba', 'supervisor_cmhc', 'supervisor_tcm')
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = '75a6fdf5-7f41-480a-8509-516e7d5e6b3d'::uuid
  );

-- Verificación: deben aparecer owner + los 3 supervisores.
SELECT r.code AS role_code, p.code AS permission
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'manage_assignments'
ORDER BY r.code;
