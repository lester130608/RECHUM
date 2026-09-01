// ---------------------------------------------------------------------------
// Motor de cálculo del área BA.
//
// CAMBIO 2026-09-01: se retiran assessment y reassessment. BA ya no ofrece
// esos servicios (confirmado por Lester). El área pasa a pagar únicamente
// horas × tarifa base.
//
// El histórico NO se toca: las pay_lines con código ASSESSMENT/REASSESSMENT
// de periodos ya calculados siguen ahí, y las filas de pay_rates con esos
// conceptos se conservan. Solo dejan de generarse de aquí en adelante.
//
// Efecto secundario: desaparece la discrepancia que teníamos entre las dos
// fuentes de tarifa de Edwina (pay_rates decía 370 y pay_role_rates 290),
// porque esas tarifas dejan de usarse.
// ---------------------------------------------------------------------------

export type BaInputEntry = {
  hours: number;
};

export type BaWorkerInput = {
  employeeId: string;
  workerName: string;
  role: string;
  baseRate: number | null;
  input: BaInputEntry;
};

export type BaLineCalculation = {
  quantity: number;
  rate: number | null;
  amount: number | null;
  applies: boolean;
};

export type BaEmployeeCalculation = {
  employeeId: string;
  workerName: string;
  role: string;
  baseRate: number | null;
  hours: BaLineCalculation;
  totalAmount: number | null;
  status: 'ready' | 'error';
  errors: Array<'missing_rate'>;
};

export type BaCalculationResult = {
  rows: BaEmployeeCalculation[];
  totalAmount: number;
  totalHours: number;
  errorCount: number;
  hasErrors: boolean;
};

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function roundToTwoHalfUp(value: number) {
  return Math.floor(value * 100 + 0.5) / 100;
}

function normalizeRole(value: string) {
  return value.trim().toUpperCase();
}

function calculateHours(hoursInput: unknown, baseRate: number | null): BaLineCalculation {
  const quantity = toFiniteNumber(hoursInput);

  if (baseRate === null) {
    return { quantity, rate: null, amount: null, applies: true };
  }

  return {
    quantity,
    rate: baseRate,
    amount: roundToTwoHalfUp(quantity * baseRate),
    applies: true,
  };
}

export function calculateBaPayroll(workers: BaWorkerInput[]): BaCalculationResult {
  const rows = workers.map((worker) => {
    const normalizedBaseRate =
      worker.baseRate === null || worker.baseRate === undefined
        ? null
        : toFiniteNumber(worker.baseRate);
    const role = normalizeRole(worker.role);

    const hours = calculateHours(worker.input.hours, normalizedBaseRate);

    const errors: Array<'missing_rate'> = [];
    if (normalizedBaseRate === null) {
      errors.push('missing_rate');
    }

    return {
      employeeId: worker.employeeId,
      workerName: worker.workerName,
      role,
      baseRate: normalizedBaseRate,
      hours,
      totalAmount: errors.length > 0 ? null : roundToTwoHalfUp(hours.amount ?? 0),
      status: errors.length > 0 ? 'error' : 'ready',
      errors,
    } satisfies BaEmployeeCalculation;
  });

  return {
    rows,
    totalAmount: roundToTwoHalfUp(rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)),
    totalHours: rows.reduce((sum, row) => sum + row.hours.quantity, 0),
    errorCount: rows.filter((row) => row.status === 'error').length,
    hasErrors: rows.some((row) => row.status === 'error'),
  };
}
