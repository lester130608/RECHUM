-- ========================================
-- Migration 0007: Legacy payroll read-only
-- Date: 2026-06-22
-- ========================================
-- /payroll/emp and /payroll/owner are preserved as historical views.
-- New writes must go through pay_runs. The only write exception is the
-- "system" role for controlled data migration/backfill operations.

CREATE OR REPLACE FUNCTION legacy_user_has_any_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees e
    JOIN user_roles ur ON ur.employee_id = e.id AND ur.active = true
    JOIN roles r ON r.id = ur.role_id
    WHERE e.user_id = auth.uid()
      AND (
        lower(r.code) = ANY(allowed_roles)
        OR lower(r.name) = ANY(allowed_roles)
      )
  );
$$;

-- payroll_emp_entries
ALTER TABLE payroll_emp_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emp_entries_select ON payroll_emp_entries;
DROP POLICY IF EXISTS emp_entries_insert ON payroll_emp_entries;
DROP POLICY IF EXISTS emp_entries_update ON payroll_emp_entries;
DROP POLICY IF EXISTS emp_entries_delete ON payroll_emp_entries;
DROP POLICY IF EXISTS payroll_emp_entries_modify ON payroll_emp_entries;
DROP POLICY IF EXISTS payroll_emp_entries_modify_old ON payroll_emp_entries;

CREATE POLICY payroll_emp_entries_select ON payroll_emp_entries
FOR SELECT TO authenticated
USING (legacy_user_has_any_role(ARRAY['owner', 'admin', 'hr', 'system']));

CREATE POLICY payroll_emp_entries_system_insert ON payroll_emp_entries
FOR INSERT TO authenticated
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_emp_entries_system_update ON payroll_emp_entries
FOR UPDATE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']))
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_emp_entries_system_delete ON payroll_emp_entries
FOR DELETE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']));

-- payroll_emp_module_status
ALTER TABLE payroll_emp_module_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emp_module_status_all ON payroll_emp_module_status;
DROP POLICY IF EXISTS payroll_emp_module_status_modify ON payroll_emp_module_status;
DROP POLICY IF EXISTS payroll_emp_module_status_modify_old ON payroll_emp_module_status;
DROP POLICY IF EXISTS payroll_emp_module_status_select ON payroll_emp_module_status;

CREATE POLICY payroll_emp_module_status_select ON payroll_emp_module_status
FOR SELECT TO authenticated
USING (legacy_user_has_any_role(ARRAY['owner', 'admin', 'hr', 'system']));

CREATE POLICY payroll_emp_module_status_system_insert ON payroll_emp_module_status
FOR INSERT TO authenticated
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_emp_module_status_system_update ON payroll_emp_module_status
FOR UPDATE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']))
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_emp_module_status_system_delete ON payroll_emp_module_status
FOR DELETE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']));

-- payroll_exports
ALTER TABLE payroll_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exports_all ON payroll_exports;
DROP POLICY IF EXISTS payroll_exports_modify ON payroll_exports;
DROP POLICY IF EXISTS payroll_exports_modify_old ON payroll_exports;
DROP POLICY IF EXISTS payroll_exports_select ON payroll_exports;

CREATE POLICY payroll_exports_select ON payroll_exports
FOR SELECT TO authenticated
USING (legacy_user_has_any_role(ARRAY['owner', 'admin', 'hr', 'system']));

CREATE POLICY payroll_exports_system_insert ON payroll_exports
FOR INSERT TO authenticated
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_exports_system_update ON payroll_exports
FOR UPDATE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']))
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_exports_system_delete ON payroll_exports
FOR DELETE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']));

-- payroll_unlock_log
ALTER TABLE payroll_unlock_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unlock_log_all ON payroll_unlock_log;
DROP POLICY IF EXISTS payroll_unlock_log_modify ON payroll_unlock_log;
DROP POLICY IF EXISTS payroll_unlock_log_modify_old ON payroll_unlock_log;
DROP POLICY IF EXISTS payroll_unlock_log_select ON payroll_unlock_log;

CREATE POLICY payroll_unlock_log_select ON payroll_unlock_log
FOR SELECT TO authenticated
USING (legacy_user_has_any_role(ARRAY['owner', 'admin', 'hr', 'system']));

CREATE POLICY payroll_unlock_log_system_insert ON payroll_unlock_log
FOR INSERT TO authenticated
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_unlock_log_system_update ON payroll_unlock_log
FOR UPDATE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']))
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_unlock_log_system_delete ON payroll_unlock_log
FOR DELETE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']));

-- payroll_module_status
ALTER TABLE payroll_module_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS module_status_all ON payroll_module_status;
DROP POLICY IF EXISTS payroll_module_status_all ON payroll_module_status;
DROP POLICY IF EXISTS payroll_module_status_modify ON payroll_module_status;
DROP POLICY IF EXISTS payroll_module_status_modify_old ON payroll_module_status;
DROP POLICY IF EXISTS payroll_module_status_select ON payroll_module_status;

CREATE POLICY payroll_module_status_select ON payroll_module_status
FOR SELECT TO authenticated
USING (legacy_user_has_any_role(ARRAY['owner', 'admin', 'hr', 'system']));

CREATE POLICY payroll_module_status_system_insert ON payroll_module_status
FOR INSERT TO authenticated
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_module_status_system_update ON payroll_module_status
FOR UPDATE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']))
WITH CHECK (legacy_user_has_any_role(ARRAY['system']));

CREATE POLICY payroll_module_status_system_delete ON payroll_module_status
FOR DELETE TO authenticated
USING (legacy_user_has_any_role(ARRAY['system']));
