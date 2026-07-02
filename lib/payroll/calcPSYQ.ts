export const PSYQ_EMPLOYEE_IDS = [
  '46b56730-1184-46da-b399-8e5a0230f571',
  '6c9001ec-1002-428a-88c0-fb3dfd34aa53',
] as const;

export type PsyqWorkerInput = {
  employeeId: string;
  workerName: string;
  role: string;
  baseRate: number | null;
};

export type PsyqEmployeeCalculation = {
  employeeId: string;
  workerName: string;
  role: string;
  fixedSalary: number | null;
  totalAmount: number | null;
  status: 'ready' | 'error';
  error: 'missing_rate' | null;
};

export type PsyqCalculationResult = {
  rows: PsyqEmployeeCalculation[];
  totalAmount: number;
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

export function calculatePsyqPayroll(workers: PsyqWorkerInput[]): PsyqCalculationResult {
  const rows = workers.map((worker) => {
    const fixedSalary =
      worker.baseRate === null || worker.baseRate === undefined ? null : roundToTwoHalfUp(toFiniteNumber(worker.baseRate));

    return {
      employeeId: worker.employeeId,
      workerName: worker.workerName,
      role: normalizeRole(worker.role),
      fixedSalary,
      totalAmount: fixedSalary,
      status: fixedSalary === null ? 'error' : 'ready',
      error: fixedSalary === null ? 'missing_rate' : null,
    } satisfies PsyqEmployeeCalculation;
  });

  return {
    rows,
    totalAmount: roundToTwoHalfUp(rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)),
    errorCount: rows.filter((row) => row.status === 'error').length,
    hasErrors: rows.some((row) => row.status === 'error'),
  };
}
