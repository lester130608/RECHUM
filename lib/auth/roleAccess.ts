type RoleCheckSuccess = {
  ok: true;
  userId: string;
  employeeId: string;
  roleCodes: string[];
};

type RoleCheckError = {
  ok: false;
  status: 401 | 403 | 500;
  error: string;
};

export const REAL_PAYROLL_ROLES = [
  'owner',
  'supervisor_ba',
  'supervisor_cmhc',
  'supervisor_tcm',
] as const;

export const SUPERVISOR_ROLES = [
  'supervisor_ba',
  'supervisor_cmhc',
  'supervisor_tcm',
] as const;

export type PayrollRole = (typeof REAL_PAYROLL_ROLES)[number];
export type PayrollArea = 'BA' | 'CMHC' | 'TCM' | 'PSYQ' | 'GENERAL';

const ROLE_TO_AREA: Record<(typeof SUPERVISOR_ROLES)[number], PayrollArea> = {
  supervisor_ba: 'BA',
  supervisor_cmhc: 'CMHC',
  supervisor_tcm: 'TCM',
};

export function normalizeRole(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeArea(value: string): PayrollArea | null {
  const area = value.trim().toUpperCase();
  if (['BA', 'CMHC', 'TCM', 'PSYQ', 'GENERAL'].includes(area)) {
    return area as PayrollArea;
  }
  return null;
}

export async function getUserRoleContext(supabase: any): Promise<RoleCheckSuccess | RoleCheckError> {
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

  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('employee_id', emp.id)
    .eq('active', true);

  if (rolesError) {
    return { ok: false, status: 500, error: rolesError.message };
  }

  if (!userRoles || userRoles.length === 0) {
    return { ok: false, status: 403, error: 'No active roles assigned' };
  }

  const roleIds = userRoles.map((role: { role_id: string }) => role.role_id);
  const { data: roles, error: roleLookupError } = await supabase
    .from('roles')
    .select('code, name')
    .in('id', roleIds);

  if (roleLookupError) {
    return { ok: false, status: 500, error: roleLookupError.message };
  }

  const roleCodes = (roles || [])
    .flatMap((role: { code?: string | null; name?: string | null }) => [role.code, role.name])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(normalizeRole);

  return {
    ok: true,
    userId: user.id,
    employeeId: emp.id,
    roleCodes,
  };
}

export function hasAnyRole(roleCodes: string[], allowedRoles: string[]) {
  const allowed = allowedRoles.map(normalizeRole);
  return roleCodes.map(normalizeRole).some((role) => allowed.includes(role));
}

export function isOwner(roleCodes: string[]) {
  return hasAnyRole(roleCodes, ['owner']);
}

export function getSupervisedAreas(roleCodes: string[]): PayrollArea[] {
  if (isOwner(roleCodes)) {
    return ['BA', 'CMHC', 'TCM', 'PSYQ', 'GENERAL'];
  }

  return SUPERVISOR_ROLES
    .filter((role) => hasAnyRole(roleCodes, [role]))
    .map((role) => ROLE_TO_AREA[role]);
}

export function canAccessPayrollArea(roleCodes: string[], area: string) {
  const normalizedArea = normalizeArea(area);
  if (!normalizedArea) {
    return false;
  }

  return getSupervisedAreas(roleCodes).includes(normalizedArea);
}

export async function requireAnyRole(supabase: any, allowedRoles: string[]): Promise<RoleCheckSuccess | RoleCheckError> {
  const context = await getUserRoleContext(supabase);
  if (!context.ok) {
    return context;
  }

  if (!hasAnyRole(context.roleCodes, allowedRoles)) {
    return { ok: false, status: 403, error: 'Insufficient permissions' };
  }

  return context;
}
