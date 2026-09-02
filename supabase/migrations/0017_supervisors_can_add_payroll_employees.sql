-- ============================================================
-- Migration 0017: los supervisores pueden dar de alta empleados
-- Fecha: 2026-09-01
-- ============================================================
-- PROBLEMA
-- Un supervisor no puede añadir empleados desde la pantalla de
-- Payroll Employees: "Failed to create employee".
--
-- La ruta hace dos inserciones. La política de employees exige:
--
--   employees_write  FOR ALL  USING current_user_has_permission('manage_employees')
--
-- y supervisor_ba solo tiene capture_hours_ba, manage_assignments y
-- view_capture_ba. La migración 0012 concedió manage_assignments, que
-- cubre la SEGUNDA inserción, pero no la primera. Se arregló media
-- función: la operación toca dos tablas y solo se miró una.
--
-- POR QUÉ NO SE CONCEDE 'manage_employees'
-- Sería lo rápido, y sería un fallo de seguridad. Ese mismo permiso
-- es el que protege la vista consolidada:
--
--   app/api/payroll/owner/consolidated/[pay_period_id]
--     → requirePermission(supabase, 'manage_employees')
--
-- Concederlo a los supervisores les abriría la nómina completa de
-- toda la plantilla, que es justo lo que cerró la migración 0015.
--
-- SOLUCIÓN
-- Un permiso nuevo y estrecho, 'create_payroll_employee', que solo
-- habilita el alta en el roster de nómina. Las políticas PERMISSIVE
-- se combinan con OR, así que esta convive con employees_write sin
-- modificarla: el owner mantiene lo que ya tenía.
--
-- Alcance deliberado: solo INSERT. Editar y borrar empleados siguen
-- siendo del owner. El borrado lógico que hace la pantalla actúa
-- sobre assignments.active, que ya cubre manage_assignments.
--
-- El límite por área lo aplica la API (canManageArea), igual que en
-- el resto del sistema.
-- ============================================================

-- ------------------------------------------------------------
-- 1. El permiso
-- ------------------------------------------------------------
-- La tabla exige 'name' además de 'code' (NOT NULL, descubierto al
-- fallar el primer intento el 2026-09-01).
INSERT INTO permissions (code, name, description)
SELECT 'create_payroll_employee',
       'Crear empleado de nomina',
       'Dar de alta empleados en el roster de nomina (solo INSERT, sin ver retribuciones)'
WHERE NOT EXISTS (
    SELECT 1 FROM permissions WHERE code = 'create_payroll_employee'
);

-- ------------------------------------------------------------
-- 2. Concederlo a los tres supervisores
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('supervisor_ba', 'supervisor_cmhc', 'supervisor_tcm')
  AND p.code = 'create_payroll_employee'
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ------------------------------------------------------------
-- 3. La política de inserción
-- ------------------------------------------------------------
DROP POLICY IF EXISTS employees_insert_payroll_roster ON employees;

CREATE POLICY employees_insert_payroll_roster ON employees
FOR INSERT WITH CHECK (
    current_user_has_permission('create_payroll_employee')
);


-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- Deben salir los 3 supervisores con el permiso nuevo,
-- y NINGUNO debe tener manage_employees.
SELECT
    r.code            AS rol,
    p.code            AS permiso,
    CASE WHEN p.code = 'manage_employees'
         THEN 'REVISAR — este abre la nomina completa'
         ELSE 'OK' END AS estado
FROM role_permissions rp
JOIN roles r       ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.code IN ('supervisor_ba', 'supervisor_cmhc', 'supervisor_tcm')
  AND p.code IN ('create_payroll_employee', 'manage_employees', 'manage_assignments')
ORDER BY r.code, p.code;
