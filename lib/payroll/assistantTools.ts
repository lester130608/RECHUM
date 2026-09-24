// lib/payroll/assistantTools.ts
//
// Las herramientas del asistente. El modelo NO escribe SQL: solo puede
// llamar a estas seis funciones, que son consultas ya escritas y revisadas.
// Devuelven filas; los promedios, comparaciones y tablas los arma el modelo
// con esas filas.
//
// Todas leen con el cliente de la sesion del usuario, asi que las politicas
// RLS siguen mandando: el asistente nunca puede ver mas que quien pregunta.
// Ninguna escribe nada.

import { chooseCurrentPeriod } from '@/lib/payroll/periods';

export const AREAS = ['BA', 'CMHC', 'TCM', 'EMP'] as const;

/**
 * Quien pregunta. Un supervisor solo ve sus areas y nunca importes: es la
 * misma regla que en las pantallas, aplicada aqui para que el asistente no
 * se convierta en la puerta de atras por la que se filtran los sueldos.
 */
export type AssistantCtx = { owner: boolean; areas: string[] };

function allowedAreas(ctx: AssistantCtx) {
  return (AREAS as readonly string[]).filter((area) => ctx.areas.includes(area));
}

/** Area pedida por el modelo, validada contra lo que puede ver quien pregunta. */
function pickArea(ctx: AssistantCtx, requested?: string) {
  if (!requested) return null;
  const area = String(requested).toUpperCase();
  if (!allowedAreas(ctx).includes(area)) {
    throw new Error(`Sin acceso al area ${area}. Areas disponibles: ${allowedAreas(ctx).join(', ')}.`);
  }
  return area;
}

const PAID_RUN_STATUSES = ['owner_approved', 'consolidated', 'exported', 'locked'];

export const ASSISTANT_TOOLS = [
  {
    name: 'list_periods',
    description:
      'Lista los periodos de nomina con sus fechas y su estado. Usala primero cuando la pregunta ' +
      'mencione "este periodo", "el anterior", un mes o un rango de fechas, para saber que week_code ' +
      'corresponde. El periodo actual viene marcado con is_current.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Cuantos periodos devolver. Por defecto 10.' },
        year: { type: 'string', description: 'Filtrar por anio de la fecha de pago, ej "2026".' },
      },
    },
  },
  {
    name: 'period_summary',
    description:
      'Resumen de un periodo por area: estado, personas, horas e importe, mas el total del periodo. ' +
      'Es la herramienta para "cuanto se pago en X" y para comparar periodos (llamala una vez por periodo).',
    input_schema: {
      type: 'object' as const,
      properties: {
        week_code: {
          type: 'string',
          description: 'Codigo del periodo, ej "P-20260822". Usa "actual" para el periodo en curso.',
        },
      },
      required: ['week_code'],
    },
  },
  {
    name: 'period_people',
    description:
      'Detalle persona a persona de un periodo: nombre, area, rol, tipo fiscal, horas e importe. ' +
      'Usala para promedios, rankings, tablas de KPI o cuando pregunten por quien cobro mas o menos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        week_code: { type: 'string', description: 'Codigo del periodo o "actual".' },
        area: { type: 'string', description: 'Opcional: BA, CMHC, TCM o EMP.' },
      },
      required: ['week_code'],
    },
  },
  {
    name: 'employee_history',
    description:
      'Historial de pagos de una persona, un renglon por periodo y area, con horas e importe. ' +
      'Busca por nombre parcial. Si el nombre coincide con varias personas, devuelve la lista de ' +
      'coincidencias para que preguntes cual.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Nombre o parte del nombre, ej "Edwina".' },
        limit: { type: 'number', description: 'Cuantos periodos. Por defecto 12.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'capture_status',
    description:
      'Como va la captura de un periodo: que ha enviado cada supervisor, cuando, y que personas ' +
      'activas del area siguen sin horas capturadas. Es la herramienta para "que falta" y "quien no ha reportado".',
    input_schema: {
      type: 'object' as const,
      properties: {
        week_code: { type: 'string', description: 'Codigo del periodo o "actual". Por defecto, el actual.' },
      },
    },
  },
  {
    name: 'list_employees',
    description:
      'Catalogo de personas con su area, rol, tipo fiscal y si estan activas. Sin importes. ' +
      'Usala para contar gente o para resolver un nombre antes de pedir su historial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        area: { type: 'string', description: 'Opcional: BA, CMHC, TCM o EMP.' },
        only_active: { type: 'boolean', description: 'Por defecto true.' },
      },
    },
  },
];

function employeeName(employee: any) {
  if (!employee) return 'Desconocido';
  return (
    employee.full_name ||
    `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() ||
    'Desconocido'
  );
}

async function loadPeriods(supabase: any) {
  const { data, error } = await supabase
    .from('pay_periods')
    .select('id, week_code, start_date, end_date, pay_date, capture_opens_at, sup_deadline, owner_deadline, status')
    .order('pay_date', { ascending: false });

  if (error) throw new Error(`No se pudieron leer los periodos: ${error.message}`);
  return data ?? [];
}

/** "actual" o un week_code. Devuelve el periodo o lanza un error con pistas. */
async function resolvePeriod(supabase: any, weekCode?: string) {
  const periods = await loadPeriods(supabase);

  if (!weekCode || weekCode.toLowerCase() === 'actual' || weekCode.toLowerCase() === 'current') {
    const current = chooseCurrentPeriod(periods as any);
    if (!current) throw new Error('No hay ningun periodo en el calendario.');
    return current as any;
  }

  const found = periods.find(
    (period: any) => String(period.week_code).toLowerCase() === weekCode.toLowerCase()
  );

  if (!found) {
    const cercanos = periods.slice(0, 5).map((period: any) => period.week_code).join(', ');
    throw new Error(`No existe el periodo ${weekCode}. Los mas recientes son: ${cercanos}.`);
  }

  return found as any;
}

async function areaRunsOf(supabase: any, periodId: string, ctx: AssistantCtx) {
  const { data, error } = await supabase
    .from('pay_runs')
    .select('id, area, status, run_level')
    .eq('period_id', periodId)
    .eq('run_level', 'area')
    .in('area', allowedAreas(ctx));

  if (error) throw new Error(`No se pudieron leer los runs: ${error.message}`);
  return data ?? [];
}

async function itemsOf(supabase: any, runIds: string[]) {
  if (runIds.length === 0) return [];
  const { data, error } = await supabase
    .from('pay_run_items')
    .select('id, pay_run_id, worker_id, calc_total_hours, calc_total_amount, employees (id, first_name, last_name, full_name)')
    .in('pay_run_id', runIds);

  if (error) throw new Error(`No se pudieron leer los importes: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// De donde salen los datos de un supervisor.
//
// La politica RLS de 0008 deja pay_run_items y pay_lines SOLO para el owner:
// son las tablas con dinero. Un supervisor que las consulte no recibe un error,
// recibe CERO FILAS, y el asistente diria tan tranquilo que esa persona no
// trabajo. Seria mentira.
//
// Asi que para el supervisor la fuente es payroll_inputs: lo que el mismo
// capturo. Es el dato que le pertenece y el unico que puede leer.
// ---------------------------------------------------------------------------

async function inputsOf(supabase: any, runs: any[]) {
  if (runs.length === 0) return new Map<string, any>();

  const { data, error } = await supabase
    .from('payroll_inputs')
    .select('pay_run_id, department, status, submitted_at, payload')
    .in('pay_run_id', runs.map((run: any) => run.id));

  if (error) throw new Error(`No se pudo leer la captura: ${error.message}`);

  const byArea = new Map<string, any>();
  for (const input of data ?? []) {
    const run = runs.find((entry: any) => entry.id === input.pay_run_id);
    if (run) byArea.set(run.area, { ...input, area: run.area, run_status: run.status });
  }
  return byArea;
}

/** Igual que inputsOf pero indexado por run: sirve para varios periodos. */
async function inputsByRun(supabase: any, runs: any[]) {
  const byRun = new Map<string, any>();
  if (runs.length === 0) return byRun;

  const { data, error } = await supabase
    .from('payroll_inputs')
    .select('pay_run_id, department, status, submitted_at, payload')
    .in('pay_run_id', runs.map((run: any) => run.id));

  if (error) throw new Error(`No se pudo leer la captura: ${error.message}`);

  for (const input of data ?? []) byRun.set(input.pay_run_id, input);
  return byRun;
}

/** Nombres de la gente de unas areas, para poner cara a los ids del payload. */
async function namesOf(supabase: any, areas: string[]) {
  const { data, error } = await supabase
    .from('assignments')
    .select('employee_id, department, role, active, employees (id, first_name, last_name, full_name)')
    .in('department', areas);

  if (error) throw new Error(`No se pudo leer el catalogo: ${error.message}`);

  const map = new Map<string, any>();
  for (const assignment of data ?? []) {
    const employee = Array.isArray(assignment.employees)
      ? assignment.employees[0]
      : assignment.employees;
    map.set(`${assignment.employee_id}|${assignment.department}`, {
      nombre: employeeName(employee),
      rol: assignment.role,
      activa: assignment.active,
    });
  }
  return map;
}

/** Lo capturado de una persona en un area, tal cual lo escribio el supervisor. */
function capturado(payload: any, employeeId: string) {
  const entry = payload?.[employeeId];
  if (!entry || typeof entry !== 'object') return null;

  const limpio: Record<string, number> = {};
  for (const [key, value] of Object.entries(entry)) {
    const numero = Number(value);
    if (Number.isFinite(numero) && numero !== 0) limpio[key] = numero;
  }
  return Object.keys(limpio).length > 0 ? limpio : null;
}

export async function runAssistantTool(
  supabase: any,
  ctx: AssistantCtx,
  name: string,
  input: any
) {
  switch (name) {
    // ---------------------------------------------------------------- periodos
    case 'list_periods': {
      const periods = await loadPeriods(supabase);
      const current = chooseCurrentPeriod(periods as any);
      const limit = Number(input?.limit) > 0 ? Number(input.limit) : 10;

      const filtered = input?.year
        ? periods.filter((period: any) => String(period.pay_date).startsWith(String(input.year)))
        : periods;

      return {
        periods: filtered.slice(0, limit).map((period: any) => ({
          week_code: period.week_code,
          trabajo: `${period.start_date} a ${period.end_date}`,
          pay_date: period.pay_date,
          captura_abre: period.capture_opens_at,
          deadline_supervisor: period.sup_deadline,
          is_current: current?.id === period.id,
        })),
        nota:
          'El estado real de un periodo esta en sus runs, no en la columna status de pay_periods, ' +
          'que no se usa. Pide period_summary para saber como va.',
      };
    }

    // ---------------------------------------------------------------- resumen
    case 'period_summary': {
      const period = await resolvePeriod(supabase, input?.week_code);
      const runs = await areaRunsOf(supabase, period.id, ctx);

      if (!ctx.owner) {
        const inputs = await inputsOf(supabase, runs);
        return {
          periodo: period.week_code,
          trabajo: `${period.start_date} a ${period.end_date}`,
          pay_date: period.pay_date,
          areas: allowedAreas(ctx).map((area) => {
            const run = runs.find((entry: any) => entry.area === area);
            const captura = inputs.get(area);
            const payload = (captura?.payload ?? {}) as Record<string, any>;
            const personas = Object.keys(payload).filter((id) => capturado(payload, id));
            const horas = personas.reduce((sum, id) => {
              const entry = capturado(payload, id) ?? {};
              return sum + (Number(entry.hours) || 0);
            }, 0);

            return {
              area,
              estado_run: run ? run.status : 'sin empezar',
              estado_captura: captura?.status ?? 'sin captura',
              enviado_el: captura?.submitted_at ?? null,
              personas_capturadas: personas.length,
              horas_capturadas: Number(horas.toFixed(2)),
            };
          }),
          nota:
            'Estas cifras son lo CAPTURADO por el supervisor, no el calculo final. ' +
            'Los importes los lleva el owner.',
        };
      }
      const items = await itemsOf(supabase, runs.map((run: any) => run.id));

      const byRun = new Map<string, { workers: Set<string>; hours: number; amount: number }>();
      for (const item of items) {
        const current = byRun.get(item.pay_run_id) ?? { workers: new Set<string>(), hours: 0, amount: 0 };
        if (item.worker_id) current.workers.add(item.worker_id);
        current.hours += Number(item.calc_total_hours) || 0;
        current.amount += Number(item.calc_total_amount) || 0;
        byRun.set(item.pay_run_id, current);
      }

      const areas = allowedAreas(ctx).map((area) => {
        const run = runs.find((entry: any) => entry.area === area);
        const aggregate = run ? byRun.get(run.id) : undefined;
        return {
          area,
          estado: run ? run.status : 'sin empezar',
          personas: aggregate?.workers.size ?? 0,
          horas: Number((aggregate?.hours ?? 0).toFixed(2)),
          // Sin importe para supervisores: el campo no se manda, no va en cero.
          ...(ctx.owner ? { importe: Number((aggregate?.amount ?? 0).toFixed(2)) } : {}),
        };
      });

      const { data: consolidated } = await supabase
        .from('pay_runs')
        .select('status')
        .eq('period_id', period.id)
        .eq('run_level', 'consolidated')
        .maybeSingle();

      return {
        periodo: period.week_code,
        trabajo: `${period.start_date} a ${period.end_date}`,
        pay_date: period.pay_date,
        consolidado: consolidated?.status ?? 'no consolidado',
        areas,
        ...(ctx.owner
          ? {
              total: Number(
                areas.reduce((sum, area: any) => sum + (area.importe ?? 0), 0).toFixed(2)
              ),
            }
          : {}),
        horas_total: Number(areas.reduce((sum, area) => sum + area.horas, 0).toFixed(2)),
      };
    }

    // ---------------------------------------------------------------- personas
    case 'period_people': {
      const period = await resolvePeriod(supabase, input?.week_code);
      let runs = await areaRunsOf(supabase, period.id, ctx);
      const area = pickArea(ctx, input?.area);
      if (area) runs = runs.filter((run: any) => run.area === area);

      if (!ctx.owner) {
        const inputs = await inputsOf(supabase, runs);
        const nombres = await namesOf(supabase, allowedAreas(ctx));
        const filasCaptura: any[] = [];

        for (const [areaName, captura] of inputs) {
          const payload = (captura.payload ?? {}) as Record<string, any>;
          for (const employeeId of Object.keys(payload)) {
            const valores = capturado(payload, employeeId);
            if (!valores) continue;
            const persona = nombres.get(`${employeeId}|${areaName}`);
            filasCaptura.push({
              persona: persona?.nombre ?? 'Desconocido',
              area: areaName,
              rol: persona?.rol ?? null,
              capturado: valores,
            });
          }
        }

        filasCaptura.sort((a, b) => String(a.persona).localeCompare(String(b.persona)));

        return {
          periodo: period.week_code,
          filas: filasCaptura,
          nota:
            'Es lo capturado, no el calculo. Las claves de "capturado" son las columnas de la ' +
            'pantalla de captura: hours son horas, y en CMHC cada clave es un servicio en unidades.',
        };
      }

      const items = await itemsOf(supabase, runs.map((run: any) => run.id));
      const runById = new Map(runs.map((run: any) => [run.id, run]));

      const { data: assignments } = await supabase
        .from('assignments')
        .select('employee_id, department, role, tax_type, active');

      const roleOf = new Map(
        (assignments ?? []).map((a: any) => [`${a.employee_id}|${a.department}`, a])
      );

      const filas = items.map((item: any) => {
        const run: any = runById.get(item.pay_run_id);
        const assignment: any = roleOf.get(`${item.worker_id}|${run?.area}`);
        return {
          persona: employeeName(Array.isArray(item.employees) ? item.employees[0] : item.employees),
          area: run?.area ?? '?',
          rol: assignment?.role ?? null,
          tipo_fiscal: assignment?.tax_type ?? null,
          horas: item.calc_total_hours == null ? null : Number(item.calc_total_hours),
          ...(ctx.owner ? { importe: Number(item.calc_total_amount) || 0 } : {}),
        };
      });

      filas.sort((a: any, b: any) =>
        ctx.owner ? (b.importe ?? 0) - (a.importe ?? 0) : (b.horas ?? 0) - (a.horas ?? 0)
      );

      return {
        periodo: period.week_code,
        filas,
        nota:
          'Una misma persona puede aparecer en dos areas. Para el total de una persona hay que sumar ' +
          'sus filas. Edwina cobra sus horas en BA y ademas el 1,5% de outreach en EMP.',
      };
    }

    // ---------------------------------------------------------------- historial
    case 'employee_history': {
      const query = String(input?.name ?? '').trim();
      if (!query) throw new Error('Hace falta un nombre.');

      const { data: matches, error: matchError } = await supabase
        .from('employees')
        .select('id, first_name, last_name, full_name')
        .or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,full_name.ilike.%${query}%`
        )
        .limit(10);

      if (matchError) throw new Error(`No se pudo buscar a la persona: ${matchError.message}`);
      if (!matches || matches.length === 0) return { coincidencias: [], nota: `Nadie coincide con "${query}".` };
      if (matches.length > 1) {
        return {
          coincidencias: matches.map((employee: any) => employeeName(employee)),
          nota: 'Hay varias personas con ese nombre. Pregunta al usuario cual antes de seguir.',
        };
      }

      const employee = matches[0];

      if (!ctx.owner) {
        const periods = await loadPeriods(supabase);
        const limitSup = Number(input?.limit) > 0 ? Number(input.limit) : 12;
        const recientes = periods.slice(0, limitSup);

        const { data: runs, error: runsError } = await supabase
          .from('pay_runs')
          .select('id, area, status, period_id, run_level')
          .eq('run_level', 'area')
          .in('area', allowedAreas(ctx))
          .in('period_id', recientes.map((period: any) => period.id));

        if (runsError) throw new Error(`No se pudieron leer los runs: ${runsError.message}`);

        const capturas = await inputsByRun(supabase, runs ?? []);
        const periodoPorId = new Map(recientes.map((period: any) => [period.id, period]));

        const filasSup: any[] = [];
        for (const run of runs ?? []) {
          const valores = capturado(capturas.get(run.id)?.payload, employee.id);
          if (!valores) continue;
          const period: any = periodoPorId.get(run.period_id);
          filasSup.push({
            periodo: period?.week_code,
            trabajo: period ? `${period.start_date} a ${period.end_date}` : null,
            pay_date: period?.pay_date ?? null,
            area: run.area,
            estado: run.status,
            capturado: valores,
          });
        }

        filasSup.sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)));

        return {
          persona: employeeName(employee),
          filas: filasSup,
          nota: 'Es lo capturado en tus areas. Los importes los lleva el owner.',
        };
      }

      const { data: items, error: itemsError } = await supabase
        .from('pay_run_items')
        .select('pay_run_id, calc_total_hours, calc_total_amount')
        .eq('worker_id', employee.id);

      if (itemsError) throw new Error(`No se pudo leer el historial: ${itemsError.message}`);

      const runIds = Array.from(new Set((items ?? []).map((item: any) => item.pay_run_id)));
      const runs = runIds.length
        ? (
            await supabase
              .from('pay_runs')
              .select('id, area, status, period_id, run_level')
              .in('id', runIds)
          ).data ?? []
        : [];

      const areaRuns = runs.filter(
        (run: any) => run.run_level === 'area' && allowedAreas(ctx).includes(run.area)
      );
      const periodIds = Array.from(new Set(areaRuns.map((run: any) => run.period_id)));
      const periods = periodIds.length
        ? (
            await supabase
              .from('pay_periods')
              .select('id, week_code, start_date, end_date, pay_date')
              .in('id', periodIds)
          ).data ?? []
        : [];

      const runById = new Map(areaRuns.map((run: any) => [run.id, run]));
      const periodById = new Map(periods.map((period: any) => [period.id, period]));

      const filas = (items ?? [])
        .map((item: any) => {
          const run: any = runById.get(item.pay_run_id);
          if (!run) return null;
          const period: any = periodById.get(run.period_id);
          if (!period) return null;
          return {
            periodo: period.week_code,
            trabajo: `${period.start_date} a ${period.end_date}`,
            pay_date: period.pay_date,
            area: run.area,
            estado: run.status,
            pagado: PAID_RUN_STATUSES.includes(run.status),
            horas: item.calc_total_hours == null ? null : Number(item.calc_total_hours),
            ...(ctx.owner ? { importe: Number(item.calc_total_amount) || 0 } : {}),
          };
        })
        .filter(Boolean) as any[];

      filas.sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)));

      const limit = Number(input?.limit) > 0 ? Number(input.limit) : 12;

      return {
        persona: employeeName(employee),
        filas: filas.slice(0, limit),
        nota: 'Solo cuentan como pagado las filas con pagado=true. Un borrador todavia no es dinero.',
      };
    }

    // ---------------------------------------------------------------- captura
    case 'capture_status': {
      const period = await resolvePeriod(supabase, input?.week_code);
      const runs = await areaRunsOf(supabase, period.id, ctx);

      const { data: inputs } = runs.length
        ? await supabase
            .from('payroll_inputs')
            .select('pay_run_id, department, status, submitted_at, payload')
            .in('pay_run_id', runs.map((run: any) => run.id))
        : { data: [] as any[] };

      const { data: assignments } = await supabase
        .from('assignments')
        .select('employee_id, department, role, active, employees (id, first_name, last_name, full_name)')
        .eq('active', true)
        .in('department', allowedAreas(ctx));

      const areas = allowedAreas(ctx).map((area) => {
        const run = runs.find((entry: any) => entry.area === area);
        const input_ = (inputs ?? []).find((entry: any) => entry.pay_run_id === run?.id);
        const payload = (input_?.payload ?? {}) as Record<string, any>;

        const conHoras = new Set(
          Object.entries(payload)
            .filter(([, value]: [string, any]) => {
              if (!value || typeof value !== 'object') return false;
              return Object.values(value).some((entry: any) => Number(entry) > 0);
            })
            .map(([employeeId]) => employeeId)
        );

        const delArea = (assignments ?? []).filter((a: any) => a.department === area);
        const sinCapturar = delArea
          .filter((a: any) => !conHoras.has(a.employee_id))
          .map((a: any) => employeeName(Array.isArray(a.employees) ? a.employees[0] : a.employees));

        return {
          area,
          estado_run: run ? run.status : 'sin empezar',
          estado_captura: input_?.status ?? 'sin captura',
          enviado_el: input_?.submitted_at ?? null,
          personas_activas: delArea.length,
          personas_con_horas: conHoras.size,
          sin_horas: sinCapturar,
        };
      });

      return {
        periodo: period.week_code,
        captura_abre: period.capture_opens_at,
        deadline_supervisor: period.sup_deadline,
        deadline_owner: period.owner_deadline,
        areas,
        nota:
          'Una persona en sin_horas puede ser normal: no todo el mundo trabaja todos los periodos. ' +
          'Es una lista para revisar, no una lista de errores.',
      };
    }

    // ---------------------------------------------------------------- catalogo
    case 'list_employees': {
      let query = supabase
        .from('assignments')
        .select('employee_id, department, role, tax_type, active, base_rate, employees (id, first_name, last_name, full_name)');

      const areaFiltro = pickArea(ctx, input?.area);
      query = areaFiltro
        ? query.eq('department', areaFiltro)
        : query.in('department', allowedAreas(ctx));
      if (input?.only_active !== false) query = query.eq('active', true);

      const { data, error } = await query;
      if (error) throw new Error(`No se pudo leer el catalogo: ${error.message}`);

      return {
        personas: (data ?? []).map((a: any) => ({
          persona: employeeName(Array.isArray(a.employees) ? a.employees[0] : a.employees),
          area: a.department,
          rol: a.role,
          tipo_fiscal: a.tax_type,
          activa: a.active,
        })),
      };
    }

    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}
