export type TcmInputEntry = {
  week1: number;
  week2: number;
};

export type TcmWorkerInput = {
  employeeId: string;
  workerName: string;
  baseRate: number | null;
  input: TcmInputEntry;
};

export type TcmWeekCalculation = {
  units: number;
  hours: number;
  rate: number | null;
  amount: number | null;
  thresholdApplied: boolean;
};

export type TcmEmployeeCalculation = {
  employeeId: string;
  workerName: string;
  baseRate: number | null;
  week1: TcmWeekCalculation;
  week2: TcmWeekCalculation;
  totalHours: number;
  totalAmount: number | null;
  status: 'ready' | 'error';
  error: 'missing_rate' | null;
};

export type TcmCalculationResult = {
  rows: TcmEmployeeCalculation[];
  totalAmount: number;
  totalHours: number;
  missingRateCount: number;
  hasErrors: boolean;
};

const HOURS_PER_UNIT = 0.25;
const THRESHOLD_HOURS = 34;
const THRESHOLD_RATE = 30;

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function roundToTwoHalfUp(value: number) {
  return Math.floor(value * 100 + 0.5) / 100;
}

function roundToFour(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function calculateWeek(unitsInput: unknown, baseRate: number | null): TcmWeekCalculation {
  const units = toFiniteNumber(unitsInput);
  const hours = roundToFour(units * HOURS_PER_UNIT);

  if (baseRate === null) {
    return {
      units,
      hours,
      rate: null,
      amount: null,
      thresholdApplied: false,
    };
  }

  const thresholdApplied = hours >= THRESHOLD_HOURS;
  const rate = thresholdApplied ? THRESHOLD_RATE : baseRate;

  return {
    units,
    hours,
    rate,
    amount: roundToTwoHalfUp(hours * rate),
    thresholdApplied,
  };
}

export function calculateTcmPayroll(workers: TcmWorkerInput[]): TcmCalculationResult {
  const rows = workers.map((worker) => {
    const normalizedBaseRate =
      worker.baseRate === null || worker.baseRate === undefined ? null : toFiniteNumber(worker.baseRate);
    const hasMissingRate = normalizedBaseRate === null;
    const week1 = calculateWeek(worker.input.week1, normalizedBaseRate);
    const week2 = calculateWeek(worker.input.week2, normalizedBaseRate);
    const totalHours = roundToFour(week1.hours + week2.hours);
    const totalAmount = hasMissingRate
      ? null
      : roundToTwoHalfUp((week1.amount ?? 0) + (week2.amount ?? 0));

    return {
      employeeId: worker.employeeId,
      workerName: worker.workerName,
      baseRate: normalizedBaseRate,
      week1,
      week2,
      totalHours,
      totalAmount,
      status: hasMissingRate ? 'error' : 'ready',
      error: hasMissingRate ? 'missing_rate' : null,
    } satisfies TcmEmployeeCalculation;
  });

  return {
    rows,
    totalAmount: roundToTwoHalfUp(
      rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)
    ),
    totalHours: roundToFour(rows.reduce((sum, row) => sum + row.totalHours, 0)),
    missingRateCount: rows.filter((row) => row.error === 'missing_rate').length,
    hasErrors: rows.some((row) => row.status === 'error'),
  };
}
