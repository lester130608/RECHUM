import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import {
  fetchConfigWithRates,
  getValidTaxTypesForRole,
  isValidRoleTaxCombo,
  jsonError,
  normalizePayConfigBody,
  todayDateString,
} from '@/lib/pay-config';

type EmployeeParams = {
  employee_id: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<EmployeeParams> }
) {
  try {
    const { employee_id: employeeId } = await context.params;
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');

    if (!permission.ok) {
      return jsonError(permission.error, permission.status);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, full_name, first_name, last_name, email')
      .eq('id', employeeId)
      .maybeSingle();

    if (employeeError) {
      return jsonError(employeeError.message, 500);
    }

    if (!employee) {
      return jsonError('Employee not found', 404);
    }

    const { data: configs, error: configsError } = await supabase
      .from('pay_role_configs')
      .select(
        `
        id,
        employee_id,
        role,
        tax_type,
        active,
        valid_from,
        valid_to,
        notes,
        created_at,
        updated_at,
        rates:pay_role_rates (
          id,
          pay_role_config_id,
          rate_key,
          rate_value,
          base_reference,
          notes,
          created_at,
          updated_at
        )
      `
      )
      .eq('employee_id', employeeId)
      .order('active', { ascending: false })
      .order('valid_from', { ascending: false });

    if (configsError) {
      return jsonError(configsError.message, 500);
    }

    const active_configs = (configs || []).filter((config: any) => config.active === true);
    const historical_configs = (configs || []).filter((config: any) => config.active === false);

    return NextResponse.json({
      employee,
      active_configs,
      historical_configs,
    });
  } catch (error: any) {
    return jsonError(error.message || 'Internal server error', 500);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<EmployeeParams> }
) {
  try {
    const { employee_id: employeeId } = await context.params;
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');

    if (!permission.ok) {
      return jsonError(permission.error, permission.status);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonError('Request body must be a JSON object', 400);
    }

    const normalized = normalizePayConfigBody(body, { requireRole: true });
    if (!normalized.ok) {
      return jsonError(normalized.error, 400);
    }

    const { role, tax_type, rates, notes } = normalized.value;

    if (!isValidRoleTaxCombo(role, tax_type)) {
      const validTypes = getValidTaxTypesForRole(role);
      return jsonError(
        `Invalid tax_type "${tax_type}" for role "${role}". Allowed: ${validTypes.join(', ')}`,
        400
      );
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .maybeSingle();

    if (employeeError) {
      return jsonError(employeeError.message, 500);
    }

    if (!employee) {
      return jsonError('Employee not found', 404);
    }

    const { data: existingConfig, error: existingError } = await supabase
      .from('pay_role_configs')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('role', role)
      .eq('active', true)
      .maybeSingle();

    if (existingError) {
      return jsonError(existingError.message, 500);
    }

    if (existingConfig) {
      return jsonError(`Employee already has an active ${role} configuration`, 409);
    }

    const { data: createdConfig, error: configError } = await supabase
      .from('pay_role_configs')
      .insert({
        employee_id: employeeId,
        role,
        tax_type,
        active: true,
        valid_from: todayDateString(),
        valid_to: null,
        notes,
      })
      .select('id')
      .single();

    if (configError) {
      return jsonError(configError.message, 500);
    }

    const { error: ratesError } = await supabase.from('pay_role_rates').insert(
      rates.map((rate) => ({
        pay_role_config_id: createdConfig.id,
        rate_key: rate.rate_key,
        rate_value: rate.rate_value,
        base_reference: rate.base_reference,
      }))
    );

    if (ratesError) {
      return jsonError(ratesError.message, 500);
    }

    const { data: config, error: fetchError } = await fetchConfigWithRates(
      supabase,
      createdConfig.id
    );

    if (fetchError) {
      return jsonError(fetchError.message, 500);
    }

    return NextResponse.json(config, { status: 201 });
  } catch (error: any) {
    return jsonError(error.message || 'Internal server error', 500);
  }
}
