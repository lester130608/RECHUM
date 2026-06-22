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
  yesterdayDateString,
} from '@/lib/pay-config';

type RoleParams = {
  employee_id: string;
  role_id: string;
};

export async function PUT(
  request: Request,
  context: { params: Promise<RoleParams> }
) {
  try {
    const { employee_id: employeeId, role_id: roleId } = await context.params;
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

    const today = todayDateString();

    const { data: currentConfig, error: currentError } = await supabase
      .from('pay_role_configs')
      .select('id, employee_id, role, tax_type, valid_from, active')
      .eq('id', roleId)
      .eq('employee_id', employeeId)
      .eq('active', true)
      .maybeSingle();

    if (currentError) {
      return jsonError(currentError.message, 500);
    }

    if (!currentConfig) {
      return jsonError('Active pay role configuration not found', 404);
    }

    if (currentConfig.valid_from === today) {
      const { error: updateError } = await supabase
        .from('pay_role_configs')
        .update({
          role,
          tax_type,
          notes,
          active: true,
          valid_from: today,
          valid_to: null,
        })
        .eq('id', roleId)
        .eq('employee_id', employeeId);

      if (updateError) {
        return jsonError(updateError.message, 500);
      }

      const { error: deleteRatesError } = await supabase
        .from('pay_role_rates')
        .delete()
        .eq('pay_role_config_id', roleId);

      if (deleteRatesError) {
        return jsonError(deleteRatesError.message, 500);
      }

      const { error: insertRatesError } = await supabase.from('pay_role_rates').insert(
        rates.map((rate) => ({
          pay_role_config_id: roleId,
          rate_key: rate.rate_key,
          rate_value: rate.rate_value,
          base_reference: rate.base_reference,
        }))
      );

      if (insertRatesError) {
        return jsonError(insertRatesError.message, 500);
      }

      const { data: config, error: fetchError } = await fetchConfigWithRates(supabase, roleId);

      if (fetchError) {
        return jsonError(fetchError.message, 500);
      }

      return NextResponse.json(config);
    }

    const { data: duplicateConfig, error: duplicateError } = await supabase
      .from('pay_role_configs')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('role', role)
      .eq('active', true)
      .neq('id', roleId)
      .maybeSingle();

    if (duplicateError) {
      return jsonError(duplicateError.message, 500);
    }

    if (duplicateConfig) {
      return jsonError(`Employee already has an active ${role} configuration`, 409);
    }

    const { error: deactivateError } = await supabase
      .from('pay_role_configs')
      .update({
        active: false,
        valid_to: yesterdayDateString(),
      })
      .eq('id', roleId)
      .eq('employee_id', employeeId)
      .eq('active', true);

    if (deactivateError) {
      return jsonError(deactivateError.message, 500);
    }

    const { data: newConfig, error: insertConfigError } = await supabase
      .from('pay_role_configs')
      .insert({
        employee_id: employeeId,
        role,
        tax_type,
        active: true,
        valid_from: today,
        valid_to: null,
        notes,
      })
      .select('id')
      .single();

    if (insertConfigError) {
      return jsonError(insertConfigError.message, 500);
    }

    const { error: insertRatesError } = await supabase.from('pay_role_rates').insert(
      rates.map((rate) => ({
        pay_role_config_id: newConfig.id,
        rate_key: rate.rate_key,
        rate_value: rate.rate_value,
        base_reference: rate.base_reference,
      }))
    );

    if (insertRatesError) {
      return jsonError(insertRatesError.message, 500);
    }

    const { data: config, error: fetchError } = await fetchConfigWithRates(
      supabase,
      newConfig.id
    );

    if (fetchError) {
      return jsonError(fetchError.message, 500);
    }

    return NextResponse.json(config);
  } catch (error: any) {
    return jsonError(error.message || 'Internal server error', 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<RoleParams> }
) {
  try {
    const { employee_id: employeeId, role_id: roleId } = await context.params;
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');

    if (!permission.ok) {
      return jsonError(permission.error, permission.status);
    }

    const { data: currentConfig, error: currentError } = await supabase
      .from('pay_role_configs')
      .select('id')
      .eq('id', roleId)
      .eq('employee_id', employeeId)
      .eq('active', true)
      .maybeSingle();

    if (currentError) {
      return jsonError(currentError.message, 500);
    }

    if (!currentConfig) {
      return jsonError('Active pay role configuration not found', 404);
    }

    const { error: deactivateError } = await supabase
      .from('pay_role_configs')
      .update({
        active: false,
        valid_to: todayDateString(),
      })
      .eq('id', roleId)
      .eq('employee_id', employeeId)
      .eq('active', true);

    if (deactivateError) {
      return jsonError(deactivateError.message, 500);
    }

    return NextResponse.json({ ok: true, deactivated_id: roleId });
  } catch (error: any) {
    return jsonError(error.message || 'Internal server error', 500);
  }
}
