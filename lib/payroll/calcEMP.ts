// ---------------------------------------------------------------------------
// Motor de cálculo del área EMP (oficina).
//
// Es el quinto motor: BA, CMHC, TCM y PSYQ ya tenían el suyo. EMP no, y por eso
// el área aportaba $0.00 al consolidado aunque la captura guardase bien.
//
// Tres tipos de trabajador conviven en esta área:
//
//   'hours'    Personal de oficina. horas × tarifa por hora.
//   'days'     Psiquiatras (Gayol, Ripoll). Salario fijo del periodo.
//              Los días se capturan como registro, NO afectan al importe.
//              Confirmado con Lester el 2026-08-31.
//   'outreach' Edwina Fernandez. Un porcentaje sobre el bruto de otra área.
//              La base se resuelve fuera (lib/owner-view.ts) y llega ya
//              calculada, porque depende del run de BA y no de esta captura.
//
// PRINCIPIO: ninguna tarifa ausente produce un importe. Si falta el dato, la
// fila sale con status 'error' y totalAmount null. Un cero se pagaría como si
// fuera real; un error se ve. Es la misma lección del 1.5% de Edwina, que
// estuvo saliendo en $0.00 durante semanas sin que nadie lo notara.
//
// Este módulo es puro: no toca Supabase. La resolución de tarifas ocurre en
// la ruta, que es quien sabe de qué tabla leerlas.
// ---------------------------------------------------------------------------

export type EmpCaptureType = 'hours' | 'days' | 'outreach';

export type EmpWorkerInput = {
  employeeId: string;
  workerName: string;
  role: string;
  captureType: EmpCaptureType;

  /** Tarifa por hora. Solo se usa con captureType 'hours'. */
  hourlyRate: number | null;

  /**
   * Tarifa de UNA unidad de salario fijo, no el total del periodo.
   *
   * El importe es `unidades capturadas × esta tarifa`. La unidad no es la
   * misma para todos: Yeline y Carlos Ripoll cobran por semana (550 y 1000),
   * Oscar y Julio por quincena (850 y 1500). Confirmado con Lester el
   * 2026-09-01.
   */
  fixedSalary: number | null;

  /** Etiqueta de la unidad, solo para mostrar: 'week', 'period'... */
  fixedSalaryUnit?: string | null;

  /** Porcentaje OUTREACH, en tanto por ciento (1.5 = 1,5 %). */
  outreachPercent: number | null;

  /** Bruto sobre el que se aplica el porcentaje. Se resuelve fuera. */
  outreachBase: number | null;

  /** Qué identifica esa base, para dejarlo trazado en la línea de pago. */
  outreachBaseReference: string | null;

  input: {
    hours?: number;
    days?: number;
  };
};

export type EmpCalculationError =
  | 'missing_hourly_rate'
  | 'missing_fixed_salary'
  | 'missing_units'
  | 'missing_outreach_percent'
  | 'missing_outreach_base'
  | 'zero_outreach_base';

export type EmpEmployeeCalculation = {
  employeeId: string;
  workerName: string;
  role: string;
  captureType: EmpCaptureType;

  /** Horas capturadas. 0 para psiquiatras y para Edwina. */
  hours: number;

  /** Días capturados. Informativos: no intervienen en el importe. */
  days: number;

  /** Tarifa efectivamente aplicada, para poder auditar el número. */
  rateUsed: number | null;

  totalAmount: number | null;
  status: 'ready' | 'error';
  error: EmpCalculationError | null;
  note: string | null;
};

export type EmpCalculationResult = {
  rows: EmpEmployeeCalculation[];
  totalAmount: number;
  totalHours: number;
  errorCount: number;
  hasErrors: boolean;
};

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Mismo redondeo que calcPSYQ y calcTCM, para que las áreas no discrepen. */
function roundToTwoHalfUp(value: number): number {
  return Math.floor(value * 100 + 0.5) / 100;
}

function normalizeRole(value: string): string {
  return (value ?? '').trim().toUpperCase();
}

function calculateRow(worker: EmpWorkerInput): EmpEmployeeCalculation {
  const hours = roundToTwoHalfUp(toFiniteNumber(worker.input?.hours));
  const days = toFiniteNumber(worker.input?.days);

  const base = {
    employeeId: worker.employeeId,
    workerName: worker.workerName,
    role: normalizeRole(worker.role),
    captureType: worker.captureType,
    hours,
    days,
  };

  switch (worker.captureType) {
    // -----------------------------------------------------------------------
    case 'hours': {
      // No todo el personal de oficina cobra por horas: Yeline Munoz tiene
      // salario fijo semanal. Si hay FIXED_SALARY configurado, manda sobre la
      // tarifa horaria y las horas quedan como registro. Comprobado con Lester
      // el 2026-08-31.
      if (worker.fixedSalary !== null && worker.fixedSalary !== undefined) {
        const unitRate = roundToTwoHalfUp(toFiniteNumber(worker.fixedSalary));
        const unidad = worker.fixedSalaryUnit || 'unidad';

        // Las unidades se capturan en el mismo campo que las horas.
        // Si no se captura ninguna, el importe es cero y hay que verlo,
        // no pagarlo: por eso sale como error y no como 0,00 válido.
        if (hours <= 0) {
          return {
            ...base,
            rateUsed: unitRate,
            totalAmount: null,
            status: 'error',
            error: 'missing_units',
            note: `Sin unidades capturadas. Cobra ${unitRate} por ${unidad}.`,
          };
        }

        return {
          ...base,
          rateUsed: unitRate,
          totalAmount: roundToTwoHalfUp(hours * unitRate),
          status: 'ready',
          error: null,
          note: `${hours} × ${unitRate} por ${unidad}`,
        };
      }

      if (worker.hourlyRate === null || worker.hourlyRate === undefined) {
        return {
          ...base,
          rateUsed: null,
          totalAmount: null,
          status: 'error',
          error: 'missing_hourly_rate',
          note: 'Sin tarifa por hora ni salario fijo configurados',
        };
      }

      const rate = toFiniteNumber(worker.hourlyRate);

      return {
        ...base,
        rateUsed: rate,
        totalAmount: roundToTwoHalfUp(hours * rate),
        status: 'ready',
        error: null,
        note: null,
      };
    }

    // -----------------------------------------------------------------------
    case 'days': {
      if (worker.fixedSalary === null || worker.fixedSalary === undefined) {
        return {
          ...base,
          rateUsed: null,
          totalAmount: null,
          status: 'error',
          error: 'missing_fixed_salary',
          note: 'Sin salario fijo configurado',
        };
      }

      const unitRate = roundToTwoHalfUp(toFiniteNumber(worker.fixedSalary));
      const unidad = worker.fixedSalaryUnit || 'unidad';

      // Mismo criterio que el personal de oficina con salario fijo: sin
      // unidades no hay importe, y eso se ve como error, no como cero.
      if (days <= 0) {
        return {
          ...base,
          rateUsed: unitRate,
          totalAmount: null,
          status: 'error',
          error: 'missing_units',
          note: `Sin unidades capturadas. Cobra ${unitRate} por ${unidad}.`,
        };
      }

      return {
        ...base,
        rateUsed: unitRate,
        totalAmount: roundToTwoHalfUp(days * unitRate),
        status: 'ready',
        error: null,
        note: `${days} × ${unitRate} por ${unidad}`,
      };
    }

    // -----------------------------------------------------------------------
    case 'outreach': {
      if (worker.outreachPercent === null || worker.outreachPercent === undefined) {
        return {
          ...base,
          rateUsed: null,
          totalAmount: null,
          status: 'error',
          error: 'missing_outreach_percent',
          note: 'Sin porcentaje configurado en pay_role_rates',
        };
      }

      // Sin base no hay importe. Antes esto devolvía 0 y se pagaba de menos.
      if (worker.outreachBase === null || worker.outreachBase === undefined) {
        return {
          ...base,
          rateUsed: worker.outreachPercent,
          totalAmount: null,
          status: 'error',
          error: 'missing_outreach_base',
          note:
            'No se pudo calcular la base del porcentaje. ' +
            'Normalmente significa que el área de origen aún no tiene run calculado.',
        };
      }

      const percent = toFiniteNumber(worker.outreachPercent);
      const baseAmount = toFiniteNumber(worker.outreachBase);
      const reference = worker.outreachBaseReference ?? 'base';

      // Una base de CERO no es un importe válido, es un aviso de que el área
      // de origen todavía no está calculada. La primera versión la trataba
      // como buena y sacaba $0.00 con estado "Ready": exactamente el cero
      // silencioso que este motor existe para evitar, colado por otra puerta.
      if (baseAmount <= 0) {
        return {
          ...base,
          rateUsed: percent,
          totalAmount: null,
          status: 'error',
          error: 'zero_outreach_base',
          note:
            `La base ${reference} vale 0. Normalmente significa que el área de ` +
            `origen aún no se ha calculado. Calcúlala primero.`,
        };
      }

      return {
        ...base,
        rateUsed: percent,
        totalAmount: roundToTwoHalfUp(baseAmount * (percent / 100)),
        status: 'ready',
        error: null,
        note: `${percent}% sobre ${reference} = ${roundToTwoHalfUp(baseAmount)}`,
      };
    }
  }
}

export function calculateEmpPayroll(workers: EmpWorkerInput[]): EmpCalculationResult {
  const rows = workers.map(calculateRow);

  return {
    rows,
    totalAmount: roundToTwoHalfUp(
      rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)
    ),
    totalHours: roundToTwoHalfUp(rows.reduce((sum, row) => sum + row.hours, 0)),
    errorCount: rows.filter((row) => row.status === 'error').length,
    hasErrors: rows.some((row) => row.status === 'error'),
  };
}
