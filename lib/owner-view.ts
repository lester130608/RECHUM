import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Vista consolidada del owner.
//
// HISTORIA: este módulo leía de payroll_ba_entries, payroll_tcm_entries,
// payroll_cmhc_entries y payroll_module_status, ninguna de las cuales existe
// en las migraciones 0001-0014. Todos los caminos de error devolvían 0, así que
// el 1.5% de Edwina salía en cero sin ningún aviso y las líneas de BA salían
// vacías en /payroll/owner/review/[id].
//
// AHORA lee del mismo modelo que app/api/payroll/owner/consolidate:
//   pay_runs (run_level='area', un run por área y periodo)
//     └── pay_run_items (worker_id, calc_total_amount)  ← el dinero real
//   assignments (employee_id, role, department, active) ← el rol real
//
// Ventaja no trivial: al leer en vivo de pay_run_items, el cálculo de OUTREACH
// es reactivo por construcción. Si se edita un RBT después de aprobar, el
// porcentaje se recalcula solo, sin necesidad de invalidar ninguna copia.
// ---------------------------------------------------------------------------

export type ModuleStatus = 'DRAFT' | 'SUBMITTED' | 'LOCKED';
export type ModuleName = 'BA' | 'TCM' | 'CMHC' | 'EMP';

export type ModuleSummary = {
  pay_period_id: string;
  pay_period: {
    id: string;
    start_date: string;
    end_date: string;
    pay_date: string;
    week_code: string;
  };
  module: ModuleName;
  status: ModuleStatus | 'NOT_STARTED';
  entries_count: number;
  total_amount: number;
  submitted_at: string | null;
  locked_at: string | null;
};

export type ConsolidatedLine = {
  employee_id: string;
  employee_name: string;
  module: ModuleName;
  role: string;
  tax_type: 'W2' | '1099';
  amount: number;
  is_outreach_calc?: boolean;
  notes?: string;
};

export type PayRoleConfigRow = {
  employee_id: string;
  role: string;
  tax_type: 'W2' | '1099';
};

/** Estados de pay_runs para run_level='area' (migración 0008). */
const AREA_RUN_STATUS_TO_MODULE_STATUS: Record<string, ModuleStatus> = {
  draft: 'DRAFT',
  review_ready: 'SUBMITTED',
  supervisor_approved: 'SUBMITTED',
  owner_approved: 'LOCKED',
  consolidated: 'LOCKED',
};

export function normalizeRole(value?: string | null): string {
  return (value ?? '').trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Runs de área
// ---------------------------------------------------------------------------

export type AreaRun = {
  id: string;
  area: string;
  status: string;
  owner_approved_at: string | null;
};

/**
 * Devuelve los runs de área del periodo, indexados por área.
 * Lanza si la consulta falla: un error de esquema no puede convertirse en
 * un total de nómina vacío.
 */
export async function getAreaRuns(
  supabase: SupabaseClient,
  payPeriodId: string
): Promise<Map<string, AreaRun>> {
  const { data, error } = await supabase
    .from('pay_runs')
    .select('id, area, status, owner_approved_at')
    .eq('period_id', payPeriodId)
    .eq('run_level', 'area');

  if (error) {
    throw new Error(`No se pudieron leer los runs de área: ${error.message}`);
  }

  return new Map((data ?? []).map((run: any) => [run.area as string, run as AreaRun]));
}

/**
 * Suma pay_run_items de un run. Opcionalmente filtra por empleados.
 */
export async function sumRunItems(
  supabase: SupabaseClient,
  payRunId: string,
  workerIds?: string[]
): Promise<{ count: number; total: number }> {
  if (workerIds && workerIds.length === 0) {
    return { count: 0, total: 0 };
  }

  let query = supabase
    .from('pay_run_items')
    .select('worker_id, calc_total_amount')
    .eq('pay_run_id', payRunId);

  if (workerIds) {
    query = query.in('worker_id', workerIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No se pudieron leer los items del run ${payRunId}: ${error.message}`);
  }

  return {
    count: data?.length ?? 0,
    total: (data ?? []).reduce(
      (sum: number, item: any) => sum + (Number(item.calc_total_amount) || 0),
      0
    ),
  };
}

// ---------------------------------------------------------------------------
// Resumen y estado por módulo
// ---------------------------------------------------------------------------

export async function getEntrySummary(
  supabase: SupabaseClient,
  payPeriodId: string,
  module: ModuleName,
  areaRuns?: Map<string, AreaRun>
): Promise<{ count: number; total: number }> {
  const runs = areaRuns ?? (await getAreaRuns(supabase, payPeriodId));
  const run = runs.get(module);
  if (!run) return { count: 0, total: 0 };

  return sumRunItems(supabase, run.id);
}

export async function getModuleStatus(
  supabase: SupabaseClient,
  payPeriodId: string,
  module: ModuleName,
  areaRuns?: Map<string, AreaRun>
): Promise<ModuleStatus | 'NOT_STARTED'> {
  const runs = areaRuns ?? (await getAreaRuns(supabase, payPeriodId));
  const run = runs.get(module);
  if (!run) return 'NOT_STARTED';

  return AREA_RUN_STATUS_TO_MODULE_STATUS[run.status] ?? 'DRAFT';
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * Empleados con un rol dado dentro de un área, según `assignments`.
 * Es la misma fuente que usan las capturas de BA y TCM, así que el conjunto
 * de RBT que ve este cálculo es exactamente el que ve el supervisor al capturar.
 */
export async function getEmployeeIdsByRole(
  supabase: SupabaseClient,
  department: string,
  role: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('employee_id, role')
    .eq('department', department)
    .eq('active', true);

  if (error) {
    throw new Error(
      `No se pudieron leer los assignments de ${department}: ${error.message}`
    );
  }

  const target = normalizeRole(role);

  return (data ?? [])
    .filter((row: any) => normalizeRole(row.role) === target)
    .map((row: any) => row.employee_id as string)
    .filter(Boolean);
}

/**
 * Configuraciones de rol y tax_type por empleado (migración 0014).
 *
 * Devuelve una LISTA por empleado, no una sola config. Un empleado puede
 * tener varias activas y son legítimas: Edwina Fernandez es a la vez
 * BCBA/1099 a 76 $/h por sus horas facturables y OUTREACH/W2 por el 1.5%.
 * Un Map de una config por persona hacía que una sobrescribiera a la otra
 * en silencio, y su tax_type salía W2 o 1099 según el orden de las filas.
 * Para ADP eso son dos tratamientos fiscales distintos.
 */
export async function getPayRoleConfigs(
  supabase: SupabaseClient,
  employeeIds: string[]
): Promise<Map<string, PayRoleConfigRow[]>> {
  if (employeeIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('pay_role_configs')
    .select('employee_id, role, tax_type')
    .in('employee_id', employeeIds)
    .eq('active', true);

  if (error) {
    throw new Error(`No se pudo leer pay_role_configs: ${error.message}`);
  }

  const byEmployee = new Map<string, PayRoleConfigRow[]>();

  for (const row of data ?? []) {
    const employeeId = row.employee_id as string;
    const list = byEmployee.get(employeeId) ?? [];
    list.push(row as PayRoleConfigRow);
    byEmployee.set(employeeId, list);
  }

  return byEmployee;
}

/**
 * Elige la config que aplica a un rol concreto.
 *
 * El rol lo dicta `assignments` — es lo que la persona hace en esa área—,
 * y pay_role_configs aporta las condiciones (tax_type) de ese rol. Si no
 * hay coincidencia exacta y solo existe una config, se usa esa; con varias
 * y ninguna coincidencia se devuelve null antes que elegir al azar, porque
 * elegir mal aquí cambia el tratamiento fiscal.
 */
export function pickConfigForRole(
  configs: PayRoleConfigRow[] | undefined,
  role: string | null | undefined
): PayRoleConfigRow | null {
  if (!configs || configs.length === 0) return null;

  const target = normalizeRole(role);
  const exact = configs.find((config) => normalizeRole(config.role) === target);
  if (exact) return exact;

  return configs.length === 1 ? configs[0] : null;
}

export type AreaAssignment = {
  role: string;
  taxType: 'W2' | '1099' | null;
};

/**
 * Rol y tipo fiscal de cada empleado dentro de un área, según `assignments`.
 *
 * El tipo fiscal se guarda POR ASIGNACIÓN, no por persona: la misma
 * trabajadora puede ser 1099 en un área y W2 en otra. Edwina Fernandez es
 * BCBA/1099 en BA y OUTREACH/W2 en EMP.
 *
 * `assignments` es la fuente buena porque es la que edita la pantalla de
 * empleados. pay_role_configs también guarda un tax_type, y si el reporte
 * leyera de ahí, editar en una pantalla no se reflejaría en la otra.
 */
export async function getAreaAssignments(
  supabase: SupabaseClient,
  department: string
): Promise<Map<string, AreaAssignment>> {
  const { data, error } = await supabase
    .from('assignments')
    .select('employee_id, role, tax_type')
    .eq('department', department)
    .eq('active', true);

  if (error) {
    throw new Error(
      `No se pudieron leer los assignments de ${department}: ${error.message}`
    );
  }

  return new Map(
    (data ?? [])
      .filter((row: any) => row.employee_id)
      .map((row: any) => [
        row.employee_id as string,
        {
          role: normalizeRole(row.role),
          taxType: row.tax_type === '1099' ? '1099' : row.tax_type === 'W2' ? 'W2' : null,
        } as AreaAssignment,
      ])
  );
}

// ---------------------------------------------------------------------------
// OUTREACH (Edwina Fernandez)
// ---------------------------------------------------------------------------

/**
 * Qué área y qué rol representa cada base_reference.
 * `role: null` significa "todos los trabajadores del área".
 */
const BASE_REFERENCE_MAP: Record<string, { area: ModuleName; role: string | null }> = {
  BA_TOTAL: { area: 'BA', role: null },
  CMHC_TOTAL: { area: 'CMHC', role: null },
  TCM_TOTAL: { area: 'TCM', role: null },
  EMP_TOTAL: { area: 'EMP', role: null },
  RBT_TOTAL: { area: 'BA', role: 'RBT' },
  BCABA_TOTAL: { area: 'BA', role: 'BCABA' },
  BCBA_TOTAL: { area: 'BA', role: 'BCBA' },
};

/**
 * Bruto que sirve de base a un cálculo por porcentaje.
 *
 * RBT_TOTAL —el caso de Edwina— suma los importes del run de BA del periodo,
 * restringido a los empleados con assignments.role = 'RBT' en department 'BA'.
 * BCABA y BCBA quedan fuera de la base: decisión de negocio confirmada.
 */
export async function getBaseReferenceTotal(
  supabase: SupabaseClient,
  payPeriodId: string,
  baseReference: string,
  areaRuns?: Map<string, AreaRun>
): Promise<number> {
  const mapping = BASE_REFERENCE_MAP[baseReference];

  if (!mapping) {
    throw new Error(
      `base_reference no soportado: '${baseReference}'. ` +
        `Válidos: ${Object.keys(BASE_REFERENCE_MAP).join(', ')}.`
    );
  }

  const runs = areaRuns ?? (await getAreaRuns(supabase, payPeriodId));
  const run = runs.get(mapping.area);

  if (!run) {
    throw new Error(
      `No existe run del área ${mapping.area} para el periodo ${payPeriodId}. ` +
        `No se puede calcular una base '${baseReference}' sin él.`
    );
  }

  const workerIds = mapping.role
    ? await getEmployeeIdsByRole(supabase, mapping.area, mapping.role)
    : undefined;

  if (mapping.role && workerIds && workerIds.length === 0) {
    throw new Error(
      `No hay empleados activos con rol ${mapping.role} en ${mapping.area}. ` +
        `La base '${baseReference}' sería 0, que casi con seguridad no es lo correcto.`
    );
  }

  const { total } = await sumRunItems(supabase, run.id, workerIds);
  return total;
}

/**
 * Importe OUTREACH: un porcentaje sobre una base.
 *
 * A diferencia de la versión anterior, NO devuelve 0 ante un fallo. Un cero
 * silencioso en nómina es peor que un error: se paga de menos y nadie se entera.
 */
export async function calculateOutreachAmount(
  supabase: SupabaseClient,
  payPeriodId: string,
  percent: number,
  baseReference: string,
  areaRuns?: Map<string, AreaRun>
): Promise<number> {
  if (!Number.isFinite(percent) || percent <= 0) {
    throw new Error(`Porcentaje OUTREACH inválido: ${percent}`);
  }

  const base = await getBaseReferenceTotal(supabase, payPeriodId, baseReference, areaRuns);

  return Math.round(base * (percent / 100) * 100) / 100;
}
