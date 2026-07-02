import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import {
  CMHC_SERVICE_CONCEPTS,
  CMHC_SERVICES,
  calculateCmhcPayroll,
  type CmhcConcept,
  type CmhcServiceName,
  type CmhcWorkerInput,
} from '@/lib/payroll/calcCMHC';

const CMHC_AREA = 'CMHC';
const PAY_RATE_CONCEPTS = Object.values(CMHC_SERVICE_CONCEPTS);

function normalizeServiceName(value?: string | null) {
  return (value ?? '').trim().toUpperCase();
}

function lineCodeForService(serviceName: CmhcServiceName) {
  return `CMHC_${serviceName.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

async function loadPeriods(supabase: any) {
  const { data: periods, error } = await supabase
    .from('pay_periods')
    .select('id, week_code, start_date, end_date, pay_date, sup_deadline, status')
    .order('pay_date', { ascending: false });

  if (error) {
    throw new Error('Failed to fetch pay periods');
  }

  return periods ?? [];
}

async function loadCmhcCalculationContext(supabase: any, periodId: string) {
  const { data: run, error: runError } = await supabase
    .from('pay_runs')
    .select('id, period_id, area, run_level, status, last_calculated_at, calculation_metadata')
    .eq('period_id', periodId)
    .eq('area', CMHC_AREA)
    .eq('run_level', 'area')
    .maybeSingle();

  if (runError) {
    throw new Error('Failed to fetch CMHC pay run');
  }

  if (!run) {
    throw new Error('No CMHC pay run exists for this period yet.');
  }

  const { data: input, error: inputError } = await supabase
    .from('payroll_inputs')
    .select('id, payload, status, submitted_at')
    .eq('pay_run_id', run.id)
    .eq('department', CMHC_AREA)
    .maybeSingle();

  if (inputError) {
    throw new Error('Failed to fetch CMHC payroll input');
  }

  if (!input?.payload) {
    throw new Error('No CMHC input has been captured for this period.');
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select(`
      employee_id,
      role,
      active,
      employees (
        id,
        first_name,
        last_name
      )
    `)
    .eq('department', CMHC_AREA)
    .eq('active', true);

  if (assignmentsError) {
    throw new Error('Failed to fetch active CMHC assignments');
  }

  const employeeIds = (assignments ?? [])
    .map((assignment: any) => assignment.employee_id)
    .filter(Boolean);

  let payRates: any[] = [];
  if (employeeIds.length > 0) {
    const { data: rates, error: ratesError } = await supabase
      .from('pay_rates')
      .select('employee_id, department, concept, rate, valid_to')
      .in('employee_id', employeeIds)
      .eq('department', CMHC_AREA)
      .in('concept', PAY_RATE_CONCEPTS)
      .is('valid_to', null);

    if (ratesError) {
      throw new Error('Failed to fetch active CMHC service rates');
    }

    payRates = rates ?? [];
  }

  const { data: fixedRates, error: fixedRatesError } = await supabase
    .from('clinician_service_rates')
    .select('service_name, rate')
    .eq('service_name', 'IT')
    .maybeSingle();

  if (fixedRatesError) {
    throw new Error('Failed to fetch fixed IT service rate');
  }

  const itRate =
    normalizeServiceName(fixedRates?.service_name) === 'IT' && fixedRates?.rate !== null && fixedRates?.rate !== undefined
      ? Number(fixedRates.rate)
      : null;

  const ratesByEmployee = new Map<string, Partial<Record<CmhcConcept, number>>>();
  for (const rate of payRates) {
    const employeeId = rate.employee_id as string;
    const concept = rate.concept as CmhcConcept;
    if (!PAY_RATE_CONCEPTS.includes(concept)) continue;

    const current = ratesByEmployee.get(employeeId) ?? {};
    current[concept] = Number(rate.rate);
    ratesByEmployee.set(employeeId, current);
  }

  const conceptByService = CMHC_SERVICE_CONCEPTS as Record<string, CmhcConcept>;
  const payload = input.payload as Record<string, Partial<Record<CmhcServiceName, number>>>;

  const workers: CmhcWorkerInput[] = (assignments ?? [])
    .map((assignment: any) => {
      const employee = assignment.employees;
      if (!employee?.id) return null;

      const employeeRates = ratesByEmployee.get(assignment.employee_id) ?? {};
      const serviceRates = CMHC_SERVICES.reduce<Partial<Record<CmhcServiceName, number | null>>>(
        (acc, serviceName) => {
          if (serviceName === 'IT') {
            acc[serviceName] = itRate;
            return acc;
          }

          const concept = conceptByService[serviceName];
          acc[serviceName] =
            employeeRates[concept] === null || employeeRates[concept] === undefined
              ? null
              : Number(employeeRates[concept]);
          return acc;
        },
        {}
      );

      return {
        employeeId: assignment.employee_id,
        workerName: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
        role: assignment.role ?? '',
        serviceRates,
        input: payload[assignment.employee_id] ?? {},
      };
    })
    .filter(Boolean)
    .sort((a: CmhcWorkerInput, b: CmhcWorkerInput) => a.workerName.localeCompare(b.workerName));

  return {
    run,
    input,
    calculation: calculateCmhcPayroll(workers),
  };
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const periods = await loadPeriods(supabase);

    return NextResponse.json({
      periods,
      selected_period_id: periods[0]?.id ?? null,
    });
  } catch (error: any) {
    console.error('GET /api/payroll/cmhc-calculation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const periodId = body.period_id as string | undefined;
    const action = body.action as 'preview' | 'confirm' | undefined;

    if (!periodId || !action) {
      return NextResponse.json({ error: 'period_id and action are required' }, { status: 400 });
    }

    if (!['preview', 'confirm'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const context = await loadCmhcCalculationContext(supabase, periodId);

    if (action === 'preview') {
      return NextResponse.json({
        pay_run: context.run,
        input: context.input,
        calculation: context.calculation,
      });
    }

    if (context.calculation.hasErrors) {
      return NextResponse.json(
        {
          error: 'Cannot save CMHC calculation while service rates are missing',
          calculation: context.calculation,
        },
        { status: 400 }
      );
    }

    if (['owner_approved', 'consolidated', 'exported', 'locked'].includes(context.run.status)) {
      return NextResponse.json(
        { error: 'Cannot overwrite an approved, consolidated, exported, or locked CMHC run' },
        { status: 403 }
      );
    }

    const { data: existingItems, error: existingItemsError } = await supabase
      .from('pay_run_items')
      .select('id')
      .eq('pay_run_id', context.run.id);

    if (existingItemsError) {
      return NextResponse.json({ error: 'Failed to fetch existing pay items' }, { status: 500 });
    }

    const existingItemIds = (existingItems ?? []).map((item: { id: string }) => item.id);

    if (existingItemIds.length > 0) {
      const { error: deleteLinesError } = await supabase
        .from('pay_lines')
        .delete()
        .in('pay_run_item_id', existingItemIds);

      if (deleteLinesError) {
        return NextResponse.json({ error: 'Failed to clear existing pay lines' }, { status: 500 });
      }
    }

    const { error: deleteItemsError } = await supabase
      .from('pay_run_items')
      .delete()
      .eq('pay_run_id', context.run.id);

    if (deleteItemsError) {
      return NextResponse.json({ error: 'Failed to clear existing pay items' }, { status: 500 });
    }

    for (const row of context.calculation.rows) {
      const { data: item, error: itemError } = await supabase
        .from('pay_run_items')
        .insert({
          pay_run_id: context.run.id,
          worker_id: row.employeeId,
          status: 'ready',
          calc_total_hours: 0,
          calc_total_amount: row.totalAmount ?? 0,
          exceptions_count: 0,
        })
        .select('id')
        .single();

      if (itemError || !item) {
        console.error('Failed to insert CMHC pay run item:', itemError);
        return NextResponse.json({ error: 'Failed to save pay item' }, { status: 500 });
      }

      const lines = row.services
        .filter((service) => service.quantity > 0)
        .map((service) => ({
          pay_run_item_id: item.id,
          line_type: 'earning',
          code: lineCodeForService(service.serviceName),
          units: service.quantity,
          hours: null,
          rate: service.rate ?? 0,
          amount: service.amount ?? 0,
          description: `CMHC ${service.serviceName}`,
          metadata: {
            department: CMHC_AREA,
            role: row.role,
            service_name: service.serviceName,
            rate_source: service.rateSource,
            concept:
              service.serviceName === 'IT'
                ? null
                : CMHC_SERVICE_CONCEPTS[service.serviceName as keyof typeof CMHC_SERVICE_CONCEPTS],
          },
          created_by: auth.userId,
        }));

      if (lines.length > 0) {
        const { error: linesError } = await supabase.from('pay_lines').insert(lines);

        if (linesError) {
          console.error('Failed to insert CMHC pay lines:', linesError);
          return NextResponse.json({ error: 'Failed to save pay lines' }, { status: 500 });
        }
      }
    }

    const { error: runUpdateError } = await supabase
      .from('pay_runs')
      .update({
        last_calculated_at: new Date().toISOString(),
        calculation_metadata: {
          engine: 'cmhc_preview_v1',
          calculated_by: auth.userId,
          total_amount: context.calculation.totalAmount,
          worker_count: context.calculation.rows.length,
          error_count: context.calculation.errorCount,
        },
      })
      .eq('id', context.run.id);

    if (runUpdateError) {
      return NextResponse.json({ error: 'Failed to mark CMHC run as calculated' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'CMHC calculation saved',
      pay_run_id: context.run.id,
      calculation: context.calculation,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/cmhc-calculation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
