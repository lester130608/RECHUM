// app/api/payroll/employees/route.ts
// Quick payroll employee management. This is intentionally separate from HR/onboarding.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  REAL_PAYROLL_ROLES,
  getSupervisedAreas,
  isOwner,
  requireAnyRole,
} from '@/lib/auth/roleAccess';

type PayrollEmployeeArea = 'BA' | 'CMHC' | 'TCM' | 'PSYQ' | 'EMP';

const AREA_ROLES: Record<string, string[]> = {
  BA: ['RBT', 'BCABA', 'BCBA'],
  CMHC: ['THERAPIST'],
  TCM: ['TCM'],
  PSYQ: ['ADMIN'],
  EMP: ['ADMIN'],
};

const PAYROLL_AREAS = ['BA', 'CMHC', 'TCM', 'PSYQ', 'EMP'] as const;

type PayrollEmployeePayload = {
  first_name?: string;
  last_name?: string;
  area?: string;
  original_area?: string;
  role?: string;
  tax_type?: string;
  rate?: number | null;
};

function normalizeRoleValue(value?: string | null) {
  return (value ?? '').trim().toUpperCase();
}

function normalizeName(value?: string | null) {
  return (value ?? '').trim();
}

function makePendingEmail(firstName: string, lastName: string) {
  const slug = `${firstName}.${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `pending.${slug || 'employee'}@dttcoaching.com`;
}

function normalizePayrollEmployeeArea(value: string): PayrollEmployeeArea | null {
  const area = value.trim().toUpperCase();
  if (PAYROLL_AREAS.includes(area as PayrollEmployeeArea)) {
    return area as PayrollEmployeeArea;
  }
  return null;
}

function canManageArea(roleCodes: string[], area: PayrollEmployeeArea) {
  if (area === 'EMP') {
    return isOwner(roleCodes);
  }

  return getSupervisedAreas(roleCodes).includes(area);
}

/**
 * W2 o 1099. Antes se creaba todo como W2 sin preguntar, y hay
 * contratistas 1099 (Gabriela Rivas, Oscar Acevedo). El tipo importa
 * para el reporte de ADP, que los separa.
 */
function normalizeTaxType(value?: string | null): 'W2' | '1099' {
  return String(value ?? '').trim() === '1099' ? '1099' : 'W2';
}

function validateRoleForArea(area: PayrollEmployeeArea, role: string) {
  const allowed = AREA_ROLES[area] ?? [];
  return allowed.includes(role);
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const owner = isOwner(auth.roleCodes);
    const visibleAreas = owner
      ? [...PAYROLL_AREAS]
      : getSupervisedAreas(auth.roleCodes).filter((area) => area !== 'GENERAL' && area !== 'PSYQ');

    const { data: assignments, error } = await supabase
      .from('assignments')
      .select(`
        employee_id,
        department,
        role,
        active,
        base_rate,
        employees (
          id,
          first_name,
          last_name,
          email,
          status,
          ready_for_payroll,
          rate
        )
      `)
      .in('department', visibleAreas);

    if (error) {
      console.error('GET /api/payroll/employees assignments error:', error);
      return NextResponse.json({ error: 'Failed to fetch payroll employees' }, { status: 500 });
    }

    const employees = (assignments ?? [])
      .map((assignment: any) => {
        const employee = assignment.employees;
        if (!employee) {
          return null;
        }

        return {
          employee_id: assignment.employee_id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          email: employee.email,
          area: assignment.department,
          role: normalizeRoleValue(assignment.role),
          active: assignment.active !== false,
          status: assignment.active === false ? 'paused' : 'active',
          ready_for_payroll: Boolean(employee.ready_for_payroll),
          rate: owner ? assignment.base_rate ?? employee.rate ?? null : undefined,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      );

    return NextResponse.json({
      is_owner: owner,
      supervised_areas: getSupervisedAreas(auth.roleCodes),
      visible_areas: visibleAreas,
      role_options: AREA_ROLES,
      employees,
    });
  } catch (error) {
    console.error('GET /api/payroll/employees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const owner = isOwner(auth.roleCodes);
    const body = (await req.json()) as PayrollEmployeePayload;
    const firstName = normalizeName(body.first_name);
    const lastName = normalizeName(body.last_name);
    const area = normalizePayrollEmployeeArea(body.area ?? '');
    const role = normalizeRoleValue(body.role);

    if (!firstName || !lastName || !area || !role) {
      return NextResponse.json({ error: 'first_name, last_name, area, and role are required' }, { status: 400 });
    }

    if (!PAYROLL_AREAS.includes(area as any)) {
      return NextResponse.json({ error: 'area must be BA, CMHC, TCM, PSYQ, or EMP' }, { status: 400 });
    }

    if (!canManageArea(auth.roleCodes, area)) {
      return NextResponse.json({ error: 'Insufficient permissions for payroll area' }, { status: 403 });
    }

    if (!owner && area === 'PSYQ') {
      return NextResponse.json({ error: 'Only owner can add PSYQ employees' }, { status: 403 });
    }

    if (!owner && area === 'EMP') {
      return NextResponse.json({ error: 'Only owner can add EMP employees' }, { status: 403 });
    }

    if (!validateRoleForArea(area, role)) {
      return NextResponse.json({ error: `Invalid role for ${area}` }, { status: 400 });
    }

    const rate = owner && typeof body.rate === 'number' ? body.rate : null;
    const taxType = normalizeTaxType(body.tax_type);

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email: makePendingEmail(firstName, lastName),
        role: 'employee',
        employee_type: taxType,
        ready_for_payroll: false,
        status: 'active',
        rate,
      })
      .select('id, first_name, last_name')
      .single();

    if (employeeError || !employee) {
      console.error('POST /api/payroll/employees employee error:', employeeError);
      return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
    }

    const { error: assignmentError } = await supabase
      .from('assignments')
      .insert({
        employee_id: employee.id,
        department: area,
        role,
        tax_type: taxType,
        // En mayúsculas: assignments_adp_pay_mode_check solo admite
        // 'HOURLY' o 'FLAT'. Con 'hourly' la inserción fallaba siempre,
        // incluso para el owner, y el alta de empleados no funcionaba
        // para nadie desde la pantalla de payroll.
        adp_pay_mode: 'HOURLY',
        base_rate: rate,
        active: true,
      });

    if (assignmentError) {
      console.error('POST /api/payroll/employees assignment error:', assignmentError);
      return NextResponse.json({ error: 'Employee created but assignment failed' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Employee added', employee }, { status: 201 });
  } catch (error) {
    console.error('POST /api/payroll/employees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const owner = isOwner(auth.roleCodes);
    const body = await req.json();
    const action = body.action as string | undefined;
    const employeeId = body.employee_id as string | undefined;
    const originalArea = normalizePayrollEmployeeArea(body.original_area ?? body.area ?? '');

    if (!action || !employeeId || !originalArea) {
      return NextResponse.json({ error: 'action, employee_id, and area are required' }, { status: 400 });
    }

    // Supervisors may only manage employees in an area they supervise.
    if (!owner && !canManageArea(auth.roleCodes, originalArea)) {
      return NextResponse.json({ error: 'Insufficient permissions for this area' }, { status: 403 });
    }

    if (action === 'pause' || action === 'resume') {
      const { error } = await supabase
        .from('assignments')
        .update({ active: action === 'resume' })
        .eq('employee_id', employeeId)
        .eq('department', originalArea);

      if (error) {
        console.error('PATCH /api/payroll/employees pause/resume error:', error);
        return NextResponse.json({ error: 'Failed to update employee status' }, { status: 500 });
      }

      return NextResponse.json({ message: action === 'resume' ? 'Employee activated' : 'Employee deactivated' });
    }

    if (action === 'edit') {
      const payload = body.employee as PayrollEmployeePayload | undefined;
      const firstName = normalizeName(payload?.first_name);
      const lastName = normalizeName(payload?.last_name);
      const area = normalizePayrollEmployeeArea(payload?.area ?? '');
      const role = normalizeRoleValue(payload?.role);

      if (!firstName || !lastName || !area || !role) {
        return NextResponse.json({ error: 'first_name, last_name, area, and role are required' }, { status: 400 });
      }

      if (!PAYROLL_AREAS.includes(area as any)) {
        return NextResponse.json({ error: 'area must be BA, CMHC, TCM, PSYQ, or EMP' }, { status: 400 });
      }

      // A supervisor cannot move an employee into an area they don't supervise.
      if (!owner && !canManageArea(auth.roleCodes, area)) {
        return NextResponse.json({ error: 'Insufficient permissions for target area' }, { status: 403 });
      }

      if (!validateRoleForArea(area, role)) {
        return NextResponse.json({ error: `Invalid role for ${area}` }, { status: 400 });
      }

      // Rate is owner-only. Never overwrite it on a supervisor edit.
      const employeeUpdate: Record<string, unknown> = {
        first_name: firstName,
        last_name: lastName,
      };
      const assignmentUpdate: Record<string, unknown> = {
        department: area,
        role,
      };
      if (owner) {
        const rate = typeof payload?.rate === 'number' ? payload.rate : null;
        employeeUpdate.rate = rate;
        assignmentUpdate.base_rate = rate;
      }

      const { error: employeeError } = await supabase
        .from('employees')
        .update(employeeUpdate)
        .eq('id', employeeId);

      if (employeeError) {
        console.error('PATCH /api/payroll/employees employee edit error:', employeeError);
        return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
      }

      const { error: assignmentError } = await supabase
        .from('assignments')
        .update(assignmentUpdate)
        .eq('employee_id', employeeId)
        .eq('department', originalArea);

      if (assignmentError) {
        console.error('PATCH /api/payroll/employees assignment edit error:', assignmentError);
        return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
      }

      return NextResponse.json({ message: 'Employee updated' });
    }

    if (action === 'remove') {
      // Soft delete: deactivate the assignment. Reversible via 'resume'.
      // History is preserved; the employee simply leaves the active roster.
      const { error } = await supabase
        .from('assignments')
        .update({ active: false })
        .eq('employee_id', employeeId)
        .eq('department', originalArea);

      if (error) {
        console.error('PATCH /api/payroll/employees remove error:', error);
        return NextResponse.json({ error: 'Failed to remove employee' }, { status: 500 });
      }

      return NextResponse.json({ message: 'Employee removed from roster' });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('PATCH /api/payroll/employees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
