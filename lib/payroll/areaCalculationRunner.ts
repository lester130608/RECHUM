import {
  calculateBaPayroll,
  type BaWorkerInput,
} from '@/lib/payroll/calcBA';
import {
  CMHC_SERVICE_CONCEPTS,
  CMHC_SERVICES,
  calculateCmhcPayroll,
  type CmhcConcept,
  type CmhcServiceName,
  type CmhcWorkerInput,
} from '@/lib/payroll/calcCMHC';
import {
  calculateTcmPayroll,
  type TcmWorkerInput,
} from '@/lib/payroll/calcTCM';

type CalculableArea = 'BA' | 'CMHC' | 'TCM';

type RunAreaCalculationOptions = {
  supabase: any;
  area: CalculableArea;
  periodId: string;
  actorId: string;
  allowErrors?: boolean;
};

type PersistableLine = {
  line_type: 'hours' | 'earning' | 'adjustment';
  code: string;
  units: number | null;
  hours: number | null;
  rate: number;
  amount: number;
  description: string;
  metadata: Record<string, any>;
};

const CMHC_PAY_RATE_CONCEPTS = Object.values(CMHC_SERVICE_CONCEPTS);

function lineCodeForCmhcService(serviceName: CmhcServiceName) {
  return `CMHC_${serviceName.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function normalizeServiceName(value?: string | null) {
  return (value ?? '').trim().toUpperCase();
}

async function getAreaRun(supabase: any, area: CalculableArea, periodId: string) {
  const { data: run, error } = await supabase
    .from('pay_runs')
    .select('id, period_id, area, run_level, status')
    .eq('period_id', periodId)
    .eq('area', area)
    .eq('run_level', 'area')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch ${area} pay run`);
  }

  if (!run) {
    throw new Error(`No ${area} pay run exists for this period.`);
  }

  return run;
}

async function getAreaInput(supabase: any, area: CalculableArea, payRunId: string) {
  const { data: input, error } = await supabase
    .from('payroll_inputs')
    .select('id, payload, status, submitted_at')
    .eq('pay_run_id', payRunId)
    .eq('department', area)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch ${area} payroll input`);
  }

  if (!input?.payload) {
    throw new Error(`No ${area} payroll input has been captured for this period.`);
  }

  return input;
}

async function clearExistingCalculation(supabase: any, payRunId: string) {
  const { data: existingItems, error: existingItemsError } = await supabase
    .from('pay_run_items')
    .select('id')
    .eq('pay_run_id', payRunId);

  if (existingItemsError) {
    throw new Error('Failed to fetch existing pay items');
  }

  const existingItemIds = (existingItems ?? []).map((item: { id: string }) => item.id);

  if (existingItemIds.length > 0) {
    const { error: deleteLinesError } = await supabase
      .from('pay_lines')
      .delete()
      .in('pay_run_item_id', existingItemIds);

    if (deleteLinesError) {
      throw new Error('Failed to clear existing pay lines');
    }
  }

  const { error: deleteItemsError } = await supabase
    .from('pay_run_items')
    .delete()
    .eq('pay_run_id', payRunId);

  if (deleteItemsError) {
    throw new Error('Failed to clear existing pay items');
  }
}

async function persistRows(
  supabase: any,
  payRunId: string,
  actorId: string,
  rows: Array<{
    employeeId: string;
    totalHours: number;
    totalAmount: number | null;
    errors: string[];
    lines: PersistableLine[];
  }>
) {
  await clearExistingCalculation(supabase, payRunId);

  for (const row of rows) {
    const hasErrors = row.errors.length > 0;
    const { data: item, error: itemError } = await supabase
      .from('pay_run_items')
      .insert({
        pay_run_id: payRunId,
        worker_id: row.employeeId,
        status: hasErrors ? 'needs_fix' : 'ready',
        calc_total_hours: row.totalHours,
        calc_total_amount: row.totalAmount ?? 0,
        exceptions_count: row.errors.length,
      })
      .select('id')
      .single();

    if (itemError || !item) {
      throw new Error('Failed to save pay item');
    }

    if (row.lines.length > 0) {
      const { error: linesError } = await supabase.from('pay_lines').insert(
        row.lines.map((line) => ({
          ...line,
          pay_run_item_id: item.id,
          created_by: actorId,
        }))
      );

      if (linesError) {
        throw new Error('Failed to save pay lines');
      }
    }
  }
}

async function loadTcm(supabase: any, periodId: string) {
  const run = await getAreaRun(supabase, 'TCM', periodId);
  const input = await getAreaInput(supabase, 'TCM', run.id);
  const { data: assignments, error } = await supabase
    .from('assignments')
    .select('employee_id, base_rate, employees(id, first_name, last_name)')
    .eq('department', 'TCM')
    .eq('active', true);

  if (error) throw new Error('Failed to fetch active TCM assignments');

  const payload = input.payload as Record<string, { week1?: number; week2?: number }>;
  const workers: TcmWorkerInput[] = (assignments ?? [])
    .map((assignment: any) => {
      const employee = assignment.employees;
      if (!employee?.id) return null;
      const captured = payload[assignment.employee_id] ?? { week1: 0, week2: 0 };
      return {
        employeeId: assignment.employee_id,
        workerName: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
        baseRate: assignment.base_rate == null ? null : Number(assignment.base_rate),
        input: {
          week1: Number(captured.week1 ?? 0),
          week2: Number(captured.week2 ?? 0),
        },
      };
    })
    .filter(Boolean);

  const calculation = calculateTcmPayroll(workers);
  return { run, calculation };
}

async function loadBa(supabase: any, periodId: string) {
  const run = await getAreaRun(supabase, 'BA', periodId);
  const input = await getAreaInput(supabase, 'BA', run.id);
  const { data: assignments, error } = await supabase
    .from('assignments')
    .select('employee_id, role, base_rate, employees(id, first_name, last_name)')
    .eq('department', 'BA')
    .eq('active', true);

  if (error) throw new Error('Failed to fetch active BA assignments');

  const employeeIds = (assignments ?? []).map((assignment: any) => assignment.employee_id).filter(Boolean);
  const { data: rates, error: ratesError } =
    employeeIds.length > 0
      ? await supabase
          .from('pay_rates')
          .select('employee_id, concept, rate, valid_to')
          .in('employee_id', employeeIds)
          .eq('department', 'BA')
          .in('concept', ['ASSESSMENT', 'REASSESSMENT'])
          .is('valid_to', null)
      : { data: [], error: null };

  if (ratesError) throw new Error('Failed to fetch active BA service rates');

  const ratesByEmployee = new Map<string, Record<string, number>>();
  for (const rate of rates ?? []) {
    const current = ratesByEmployee.get(rate.employee_id) ?? {};
    current[rate.concept] = Number(rate.rate);
    ratesByEmployee.set(rate.employee_id, current);
  }

  const payload = input.payload as Record<string, { hours?: number; assessment?: number; reassessment?: number }>;
  const workers: BaWorkerInput[] = (assignments ?? [])
    .map((assignment: any) => {
      const employee = assignment.employees;
      if (!employee?.id) return null;
      const captured = payload[assignment.employee_id] ?? { hours: 0, assessment: 0, reassessment: 0 };
      const employeeRates = ratesByEmployee.get(assignment.employee_id) ?? {};
      return {
        employeeId: assignment.employee_id,
        workerName: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
        role: assignment.role ?? '',
        baseRate: assignment.base_rate == null ? null : Number(assignment.base_rate),
        serviceRates: {
          assessment: employeeRates.ASSESSMENT == null ? null : Number(employeeRates.ASSESSMENT),
          reassessment: employeeRates.REASSESSMENT == null ? null : Number(employeeRates.REASSESSMENT),
        },
        input: {
          hours: Number(captured.hours ?? 0),
          assessment: Number(captured.assessment ?? 0),
          reassessment: Number(captured.reassessment ?? 0),
        },
      };
    })
    .filter(Boolean);

  const calculation = calculateBaPayroll(workers);
  return { run, calculation };
}

async function loadCmhc(supabase: any, periodId: string) {
  const run = await getAreaRun(supabase, 'CMHC', periodId);
  const input = await getAreaInput(supabase, 'CMHC', run.id);
  const { data: assignments, error } = await supabase
    .from('assignments')
    .select('employee_id, role, employees(id, first_name, last_name)')
    .eq('department', 'CMHC')
    .eq('active', true);

  if (error) throw new Error('Failed to fetch active CMHC assignments');

  const employeeIds = (assignments ?? []).map((assignment: any) => assignment.employee_id).filter(Boolean);
  const { data: payRates, error: ratesError } =
    employeeIds.length > 0
      ? await supabase
          .from('pay_rates')
          .select('employee_id, concept, rate, valid_to')
          .in('employee_id', employeeIds)
          .eq('department', 'CMHC')
          .in('concept', CMHC_PAY_RATE_CONCEPTS)
          .is('valid_to', null)
      : { data: [], error: null };

  if (ratesError) throw new Error('Failed to fetch active CMHC service rates');

  const { data: fixedRate, error: fixedRateError } = await supabase
    .from('clinician_service_rates')
    .select('service_name, rate')
    .eq('service_name', 'IT')
    .maybeSingle();

  if (fixedRateError) throw new Error('Failed to fetch fixed IT service rate');

  const itRate =
    normalizeServiceName(fixedRate?.service_name) === 'IT' && fixedRate?.rate != null
      ? Number(fixedRate.rate)
      : null;

  const ratesByEmployee = new Map<string, Record<string, number>>();
  for (const rate of payRates ?? []) {
    const current = ratesByEmployee.get(rate.employee_id) ?? {};
    current[rate.concept] = Number(rate.rate);
    ratesByEmployee.set(rate.employee_id, current);
  }

  const payload = input.payload as Record<string, Partial<Record<CmhcServiceName, number>>>;
  const conceptByService = CMHC_SERVICE_CONCEPTS as Record<string, CmhcConcept>;
  const workers: CmhcWorkerInput[] = (assignments ?? [])
    .map((assignment: any) => {
      const employee = assignment.employees;
      if (!employee?.id) return null;
      const employeeRates = ratesByEmployee.get(assignment.employee_id) ?? {};
      const serviceRates = CMHC_SERVICES.reduce<Partial<Record<CmhcServiceName, number | null>>>(
        (acc, serviceName) => {
          if (serviceName === 'IT') {
            acc[serviceName] = itRate;
          } else {
            const concept = conceptByService[serviceName];
            acc[serviceName] = employeeRates[concept] == null ? null : Number(employeeRates[concept]);
          }
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
    .filter(Boolean);

  const calculation = calculateCmhcPayroll(workers);
  return { run, calculation };
}

function tcmRows(calculation: Awaited<ReturnType<typeof loadTcm>>['calculation']) {
  return calculation.rows.map((row) => ({
    employeeId: row.employeeId,
    totalHours: row.totalHours,
    totalAmount: row.totalAmount,
    errors: row.error ? [row.error] : [],
    lines: [
      {
        line_type: 'hours' as const,
        code: 'TCM_WEEK_1',
        units: row.week1.units,
        hours: row.week1.hours,
        rate: row.week1.rate ?? 0,
        amount: row.week1.amount ?? 0,
        description: 'TCM week 1 units converted to hours',
        metadata: { department: 'TCM', week: 1, error: row.error, base_rate: row.baseRate },
      },
      {
        line_type: 'hours' as const,
        code: 'TCM_WEEK_2',
        units: row.week2.units,
        hours: row.week2.hours,
        rate: row.week2.rate ?? 0,
        amount: row.week2.amount ?? 0,
        description: 'TCM week 2 units converted to hours',
        metadata: { department: 'TCM', week: 2, error: row.error, base_rate: row.baseRate },
      },
    ],
  }));
}

function baRows(calculation: Awaited<ReturnType<typeof loadBa>>['calculation']) {
  return calculation.rows.map((row) => ({
    employeeId: row.employeeId,
    totalHours: row.hours.quantity,
    totalAmount: row.totalAmount,
    errors: row.errors,
    lines: [
      {
        line_type: 'hours' as const,
        code: 'BA_HOURS',
        units: row.hours.quantity,
        hours: row.hours.quantity,
        rate: row.hours.rate ?? 0,
        amount: row.hours.amount ?? 0,
        description: 'BA hours',
        metadata: { department: 'BA', role: row.role, errors: row.errors },
      },
      {
        line_type: 'earning' as const,
        code: 'BA_ASSESSMENT',
        units: row.assessment.quantity,
        hours: null,
        rate: row.assessment.rate ?? 0,
        amount: row.assessment.amount ?? 0,
        description: 'BA assessment',
        metadata: { department: 'BA', concept: 'ASSESSMENT', role: row.role, errors: row.errors },
      },
      {
        line_type: 'earning' as const,
        code: 'BA_REASSESSMENT',
        units: row.reassessment.quantity,
        hours: null,
        rate: row.reassessment.rate ?? 0,
        amount: row.reassessment.amount ?? 0,
        description: 'BA reassessment',
        metadata: { department: 'BA', concept: 'REASSESSMENT', role: row.role, errors: row.errors },
      },
    ],
  }));
}

function cmhcRows(calculation: Awaited<ReturnType<typeof loadCmhc>>['calculation']) {
  return calculation.rows.map((row) => ({
    employeeId: row.employeeId,
    totalHours: 0,
    totalAmount: row.totalAmount,
    errors: row.errors,
    lines: row.services
      .filter((service) => service.quantity > 0 || service.error)
      .map((service) => ({
        line_type: 'earning' as const,
        code: lineCodeForCmhcService(service.serviceName),
        units: service.quantity,
        hours: null,
        rate: service.rate ?? 0,
        amount: service.amount ?? 0,
        description: `CMHC ${service.serviceName}`,
        metadata: {
          department: 'CMHC',
          role: row.role,
          service_name: service.serviceName,
          rate_source: service.rateSource,
          error: service.error,
        },
      })),
  }));
}

export async function calculateAndSaveArea({
  supabase,
  area,
  periodId,
  actorId,
  allowErrors = false,
}: RunAreaCalculationOptions) {
  const context =
    area === 'TCM'
      ? await loadTcm(supabase, periodId)
      : area === 'BA'
        ? await loadBa(supabase, periodId)
        : await loadCmhc(supabase, periodId);

  if (['owner_approved', 'consolidated', 'exported', 'locked'].includes(context.run.status)) {
    throw new Error(`Cannot recalculate ${area} after approval or consolidation`);
  }

  if (context.calculation.hasErrors && !allowErrors) {
    throw new Error(`Cannot save ${area} calculation while rates are missing`);
  }

  const rows =
    area === 'TCM'
      ? tcmRows(context.calculation as Awaited<ReturnType<typeof loadTcm>>['calculation'])
      : area === 'BA'
        ? baRows(context.calculation as Awaited<ReturnType<typeof loadBa>>['calculation'])
        : cmhcRows(context.calculation as Awaited<ReturnType<typeof loadCmhc>>['calculation']);

  await persistRows(supabase, context.run.id, actorId, rows);

  await supabase
    .from('pay_runs')
    .update({
      status: 'review_ready',
      last_calculated_at: new Date().toISOString(),
      calculation_metadata: {
        engine: `${area.toLowerCase()}_submit_v1`,
        calculated_by: actorId,
        total_amount: context.calculation.totalAmount,
        total_hours: 'totalHours' in context.calculation ? context.calculation.totalHours : 0,
        worker_count: context.calculation.rows.length,
        error_count:
          'errorCount' in context.calculation
            ? context.calculation.errorCount
            : 'missingRateCount' in context.calculation
              ? context.calculation.missingRateCount
              : 0,
      },
    })
    .eq('id', context.run.id);

  return {
    payRunId: context.run.id,
    hasErrors: context.calculation.hasErrors,
  };
}
