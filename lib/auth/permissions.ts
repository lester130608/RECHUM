type PermissionOk = {
  ok: true;
  employeeId: string;
};

type PermissionError = {
  ok: false;
  status: 401 | 403 | 500;
  error: string;
};

export async function requirePermission(
  supabase: any,
  permissionCode: string
): Promise<PermissionOk | PermissionError> {
  // 1) Verificar usuario autenticado
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, status: 401, error: authError.message };
  }
  if (!user) {
    return { ok: false, status: 401, error: 'User is not authenticated' };
  }

  // 2) Obtener empleado vinculado al user_id
  const { data: emp, error: empError } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (empError) {
    return { ok: false, status: 500, error: empError.message };
  }
  if (!emp) {
    return { ok: false, status: 403, error: 'No employee linked to this user' };
  }

  // 3) Obtener roles activos del empleado
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('employee_id', emp.id)
    .eq('active', true);

  if (rolesError) {
    return { ok: false, status: 500, error: rolesError.message };
  }
  if (!userRoles || userRoles.length === 0) {
    return {
      ok: false,
      status: 403,
      error: `No active roles for user (missing ${permissionCode})`,
    };
  }

  const roleIds = userRoles.map((r: any) => r.role_id);

  // 4) Obtener permission_ids de esos roles
  const { data: rolePerms, error: rpError } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .in('role_id', roleIds);

  if (rpError) {
    return { ok: false, status: 500, error: rpError.message };
  }
  if (!rolePerms || rolePerms.length === 0) {
    return {
      ok: false,
      status: 403,
      error: `No permissions for assigned roles (missing ${permissionCode})`,
    };
  }

  const permIds = rolePerms.map((rp: any) => rp.permission_id);

  // 5) Verificar si entre esos permisos está el requerido
  const { data: perms, error: pError } = await supabase
    .from('permissions')
    .select('code')
    .in('id', permIds)
    .eq('code', permissionCode);

  if (pError) {
    return { ok: false, status: 500, error: pError.message };
  }

  if (!perms || perms.length === 0) {
    return {
      ok: false,
      status: 403,
      error: `Missing required permission: ${permissionCode}`,
    };
  }

  return { ok: true, employeeId: emp.id };
}
