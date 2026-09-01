import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { jsonError } from '@/lib/pay-config';
import {
  calculateOutreachAmount,
  getAreaRuns,
  getPayRoleConfigs,
  getRolesByEmployee,
  pickConfigForRole,
  type ConsolidatedLine,
  type ModuleName,
} from '@/lib/owner-view';

// ---------------------------------------------------------------------------
// Vista consolidada por empleado de un periodo.
//
// Antes leía de payroll_ba_entries / pay_role_configs asumiendo que un error
// "la tabla no existe" equivalía a "no hay datos". Como esas tablas nunca se
// crearon, BA salía vacío y OUTREACH no salía nunca. Ahora lee de
// pay_run_items, la misma fuente que app/api/payroll/owner/consolidate, para
// que el detalle por empleado y el gran total no puedan discrepar.
// ---------------------------------------------------------------------------

const MODULES: ModuleName[] = ['BA', 'CMHC', 'TCM', 'EMP'];

/** Rol por defecto de cada área cuando el empleado no tiene pay_role_config. */
const DEFAULT_ROLE_BY_MODULE: Record<ModuleName, string> = {
  BA: 'RBT',
  CMHC: 'THERAPIST',
  TCM: 'TCM',
  EMP: 'EMPLOYEE',
};

function getEmployeeName(employee: any) {
  return (
    employee?.full_name ||
    `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim() ||
    'Unknown'
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ pay_period_id: string }> }
) {
  try {
    const { pay_period_id } = await context.params;
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');
    if (!permission.ok) return jsonError(permission.error, permission.status);

    const areaRuns = await getAreaRuns(supabase, pay_period_id);
    const lines: ConsolidatedLine[] = [];
    const warnings: string[] = [];

    // -----------------------------------------------------------------------
    // 1. Líneas de las cuatro áreas, desde pay_run_items.
    // -----------------------------------------------------------------------
    const itemsByModule = new Map<ModuleName, any[]>();
    const allEmployeeIds = new Set<string>();

    for (const module of MODULES) {
      const run = areaRuns.get(module);
      if (!run) {
        warnings.push(`El área ${module} todavía no tiene run en este periodo.`);
        continue;
      }

      const { data: items, error } = await supabase
        .from('pay_run_items')
        .select(
          `
          worker_id,
          calc_total_amount,
          employees!inner (id, first_name, last_name, full_name)
        `
        )
        .eq('pay_run_id', run.id);

      if (error) {
        return jsonError(
          `No se pudieron leer los items del área ${module}: ${error.message}`,
          500
        );
      }

      itemsByModule.set(module, items ?? []);
      for (const item of items ?? []) {
        if (item.worker_id) allEmployeeIds.add(item.worker_id as string);
      }
    }

    const configs = await getPayRoleConfigs(supabase, Array.from(allEmployeeIds));

    // El rol que alguien desempeña depende del ÁREA, no de la persona: Edwina
    // es BCBA en BA y OUTREACH en EMP. `assignments` es quien lo sabe, y con
    // ese rol se elige la config correcta y por tanto el tax_type correcto.
    const rolesByModule = new Map<ModuleName, Map<string, string>>();
    for (const module of MODULES) {
      if (itemsByModule.has(module)) {
        rolesByModule.set(module, await getRolesByEmployee(supabase, module));
      }
    }

    for (const module of MODULES) {
      for (const item of itemsByModule.get(module) ?? []) {
        const employee = Array.isArray(item.employees) ? item.employees[0] : item.employees;
        const workerId = item.worker_id as string;

        const assignedRole = rolesByModule.get(module)?.get(workerId) ?? null;
        const config = pickConfigForRole(configs.get(workerId), assignedRole);
        const employeeName = getEmployeeName(employee);

        if (!config && (configs.get(workerId)?.length ?? 0) > 1) {
          warnings.push(
            `${employeeName} tiene varias configuraciones activas y ninguna coincide ` +
              `con su rol en ${module} (${assignedRole ?? 'sin rol asignado'}). ` +
              `Se muestra W2 por defecto: verificar antes de exportar a ADP.`
          );
        }

        lines.push({
          employee_id: workerId,
          employee_name: employeeName,
          module,
          role: config?.role || assignedRole || DEFAULT_ROLE_BY_MODULE[module],
          tax_type: config?.tax_type || 'W2',
          amount: Number(item.calc_total_amount) || 0,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 2. Líneas OUTREACH (Edwina Fernandez): porcentaje sobre una base.
    //
    // Se calculan al final porque dependen de los totales de las áreas.
    // Si la configuración existe pero el cálculo falla, se reporta como
    // warning explícito en lugar de dejar la línea en 0 sin avisar.
    // -----------------------------------------------------------------------
    // El código convive con dos convenciones: /admin/pay-configuration crea a
    // Edwina con role='OUTREACH', mientras que el módulo EMP la trata como
    // role='EMPLOYEE' con una tarifa PERCENT. Se detecta por la tarifa, que es
    // lo que de verdad define el cálculo, para que ambas funcionen.
    const { data: allConfigs, error: outreachError } = await supabase
      .from('pay_role_configs')
      .select(
        `
        employee_id,
        role,
        tax_type,
        employees!inner (id, first_name, last_name, full_name),
        pay_role_rates (rate_key, rate_value, base_reference)
      `
      )
      .eq('active', true);

    if (outreachError) {
      return jsonError(
        `No se pudo leer la configuración de roles de pago: ${outreachError.message}. ` +
          `¿Está aplicada la migración 0014?`,
        500
      );
    }

    const outreachConfigs = (allConfigs ?? []).filter((config: any) =>
      (config.pay_role_rates as any[])?.some((rate: any) => rate.rate_key === 'PERCENT')
    );

    if (outreachConfigs.length === 0) {
      warnings.push(
        'No hay ninguna configuración OUTREACH activa. Si Edwina Fernandez debe ' +
          'cobrar el porcentaje sobre RBT, hay que darla de alta en ' +
          '/admin/pay-configuration.'
      );
    }

    for (const config of outreachConfigs) {
      const employee = Array.isArray(config.employees) ? config.employees[0] : config.employees;
      const employeeName = getEmployeeName(employee);
      const percentRate = (config.pay_role_rates as any[])?.find(
        (rate: any) => rate.rate_key === 'PERCENT'
      );

      if (!percentRate) {
        warnings.push(`${employeeName} tiene config OUTREACH pero no tiene tarifa PERCENT.`);
        continue;
      }

      // Guarda contra doble conteo: hoy el área EMP no genera pay_run_items,
      // así que la línea OUTREACH es la única fuente de ese importe. Si en el
      // futuro se añade un motor de cálculo de EMP que ya incluya a esta
      // persona, sumar además la línea la pagaría dos veces.
      const alreadyInEmpRun = (itemsByModule.get('EMP') ?? []).some(
        (item: any) => item.worker_id === config.employee_id
      );

      if (alreadyInEmpRun) {
        warnings.push(
          `${employeeName} ya tiene importe calculado en el run de EMP; ` +
            `se omite la línea OUTREACH para no contarla dos veces.`
        );
        continue;
      }

      try {
        const amount = await calculateOutreachAmount(
          supabase,
          pay_period_id,
          Number(percentRate.rate_value),
          percentRate.base_reference,
          areaRuns
        );

        lines.push({
          employee_id: config.employee_id,
          employee_name: employeeName,
          module: 'EMP',
          role: 'OUTREACH',
          tax_type: (config.tax_type as 'W2' | '1099') || 'W2',
          amount,
          is_outreach_calc: true,
          notes: `${percentRate.rate_value}% x ${percentRate.base_reference}`,
        });
      } catch (error: any) {
        warnings.push(
          `No se pudo calcular el OUTREACH de ${employeeName}: ${error.message}`
        );
      }
    }

    lines.sort((a, b) => {
      if (a.tax_type !== b.tax_type) {
        return a.tax_type === 'W2' ? -1 : 1;
      }
      return a.employee_name.localeCompare(b.employee_name);
    });

    const total = lines.reduce((sum, line) => sum + line.amount, 0);

    return NextResponse.json({ lines, total, warnings });
  } catch (error: any) {
    return jsonError(error.message || 'Internal error', 500);
  }
}
