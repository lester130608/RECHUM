export type BaInputEntry = {
  hours: number;
  assessment: number;
  reassessment: number;
};

export type BaServiceRates = {
  assessment: number | null;
  reassessment: number | null;
};

export type BaWorkerInput = {
  employeeId: string;
  workerName: string;
  role: string;
  baseRate: number | null;
  serviceRates: BaServiceRates;
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
  assessment: BaLineCalculation;
  reassessment: BaLineCalculation;
  totalAmount: number | null;
  status: 'ready' | 'error';
  errors: Array<'missing_rate' | 'missing_service_rate'>;
};

export type BaCalculationResult = {
  rows: BaEmployeeCalculation[];
  totalAmount: number;
  totalHours: number;
  errorCount: number;
  hasErrors: boolean;
};

const ASSESSMENT_ROLES = ['BCABA', 'BCBA'];

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

function canPayAssessment(role: string) {
  return ASSESSMENT_ROLES.includes(normalizeRole(role));
}

function calculateHours(hoursInput: unknown, baseRate: number | null): BaLineCalculation {
  const quantity = toFiniteNumber(hoursInput);

  if (baseRate === null) {
    return {
      quantity,
      rate: null,
      amount: null,
      applies: true,
    };
  }

  return {
    quantity,
    rate: baseRate,
    amount: roundToTwoHalfUp(quantity * baseRate),
    applies: true,
  };
}

function calculateService(
  quantityInput: unknown,
  rate: number | null,
  applies: boolean
): BaLineCalculation {
  const quantity = applies ? toFiniteNumber(quantityInput) : 0;

  if (!applies) {
    return {
      quantity,
      rate: null,
      amount: null,
      applies: false,
    };
  }

  if (quantity > 0 && rate === null) {
    return {
      quantity,
      rate: null,
      amount: null,
      applies: true,
    };
  }

  return {
    quantity,
    rate,
    amount: roundToTwoHalfUp(quantity * (rate ?? 0)),
    applies: true,
  };
}

export function calculateBaPayroll(workers: BaWorkerInput[]): BaCalculationResult {
  const rows = workers.map((worker) => {
    const normalizedBaseRate =
      worker.baseRate === null || worker.baseRate === undefined ? null : toFiniteNumber(worker.baseRate);
    const normalizedAssessmentRate =
      worker.serviceRates.assessment === null || worker.serviceRates.assessment === undefined
        ? null
        : toFiniteNumber(worker.serviceRates.assessment);
    const normalizedReassessmentRate =
      worker.serviceRates.reassessment === null || worker.serviceRates.reassessment === undefined
        ? null
        : toFiniteNumber(worker.serviceRates.reassessment);
    const role = normalizeRole(worker.role);
    const assessmentApplies = canPayAssessment(role);

    const hours = calculateHours(worker.input.hours, normalizedBaseRate);
    const assessment = calculateService(
      worker.input.assessment,
      normalizedAssessmentRate,
      assessmentApplies
    );
    const reassessment = calculateService(
      worker.input.reassessment,
      normalizedReassessmentRate,
      assessmentApplies
    );

    const errors: Array<'missing_rate' | 'missing_service_rate'> = [];
    if (normalizedBaseRate === null) {
      errors.push('missing_rate');
    }
    if (assessmentApplies && assessment.quantity > 0 && normalizedAssessmentRate === null) {
      errors.push('missing_service_rate');
    }
    if (assessmentApplies && reassessment.quantity > 0 && normalizedReassessmentRate === null) {
      errors.push('missing_service_rate');
    }

    const totalAmount =
      errors.length > 0
        ? null
        : roundToTwoHalfUp(
            (hours.amount ?? 0) + (assessment.amount ?? 0) + (reassessment.amount ?? 0)
          );

    return {
      employeeId: worker.employeeId,
      workerName: worker.workerName,
      role,
      baseRate: normalizedBaseRate,
      hours,
      assessment,
      reassessment,
      totalAmount,
      status: errors.length > 0 ? 'error' : 'ready',
      errors,
    } satisfies BaEmployeeCalculation;
  });

  return {
    rows,
    totalAmount: roundToTwoHalfUp(
      rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)
    ),
    totalHours: rows.reduce((sum, row) => sum + row.hours.quantity, 0),
    errorCount: rows.filter((row) => row.status === 'error').length,
    hasErrors: rows.some((row) => row.status === 'error'),
  };
}
