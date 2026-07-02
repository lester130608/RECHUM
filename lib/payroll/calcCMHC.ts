export const CMHC_SERVICE_CONCEPTS = {
  BIO: 'BIO_RATE',
  'IN-DEPTH BIO': 'IN_DEPTH_BIO_RATE',
  'IN-DEPTH EXISTING': 'IN_DEPTH_EXISTING_RATE',
  'IN-DEPTH INTAKE': 'IN_DEPTH_INTAKE_RATE',
  INTAKE: 'INTAKE_RATE',
  TP: 'TP_RATE',
  'TP REVIEW': 'TP_REVIEW_RATE',
} as const;

export const CMHC_FIXED_RATE_SERVICES = ['IT'] as const;

export const CMHC_SERVICES = [
  'BIO',
  'IN-DEPTH BIO',
  'IN-DEPTH EXISTING',
  'IN-DEPTH INTAKE',
  'INTAKE',
  'IT',
  'TP',
  'TP REVIEW',
] as const;

export type CmhcServiceName = (typeof CMHC_SERVICES)[number];
export type CmhcConcept = (typeof CMHC_SERVICE_CONCEPTS)[keyof typeof CMHC_SERVICE_CONCEPTS];

export type CmhcInputEntry = Partial<Record<CmhcServiceName, number>>;

export type CmhcWorkerInput = {
  employeeId: string;
  workerName: string;
  role: string;
  serviceRates: Partial<Record<CmhcServiceName, number | null>>;
  input: CmhcInputEntry;
};

export type CmhcServiceCalculation = {
  serviceName: CmhcServiceName;
  quantity: number;
  rate: number | null;
  amount: number | null;
  rateSource: 'pay_rates' | 'clinician_service_rates';
  error: 'missing_service_rate' | null;
};

export type CmhcEmployeeCalculation = {
  employeeId: string;
  workerName: string;
  role: string;
  services: CmhcServiceCalculation[];
  totalAmount: number | null;
  status: 'ready' | 'error';
  errors: Array<'missing_service_rate'>;
};

export type CmhcCalculationResult = {
  rows: CmhcEmployeeCalculation[];
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

function calculateService(
  serviceName: CmhcServiceName,
  quantityInput: unknown,
  rate: number | null
): CmhcServiceCalculation {
  const quantity = toFiniteNumber(quantityInput);
  const rateSource = serviceName === 'IT' ? 'clinician_service_rates' : 'pay_rates';

  if (quantity > 0 && rate === null) {
    return {
      serviceName,
      quantity,
      rate: null,
      amount: null,
      rateSource,
      error: 'missing_service_rate',
    };
  }

  return {
    serviceName,
    quantity,
    rate,
    amount: roundToTwoHalfUp(quantity * (rate ?? 0)),
    rateSource,
    error: null,
  };
}

export function calculateCmhcPayroll(workers: CmhcWorkerInput[]): CmhcCalculationResult {
  const rows = workers.map((worker) => {
    const role = normalizeRole(worker.role);
    const services = CMHC_SERVICES.map((serviceName) => {
      const rawRate = worker.serviceRates[serviceName];
      const normalizedRate = rawRate === null || rawRate === undefined ? null : toFiniteNumber(rawRate);
      return calculateService(serviceName, worker.input[serviceName] ?? 0, normalizedRate);
    });
    const errors = services
      .filter((service) => service.error === 'missing_service_rate')
      .map(() => 'missing_service_rate' as const);
    const totalAmount =
      errors.length > 0
        ? null
        : roundToTwoHalfUp(services.reduce((sum, service) => sum + (service.amount ?? 0), 0));

    return {
      employeeId: worker.employeeId,
      workerName: worker.workerName,
      role,
      services,
      totalAmount,
      status: errors.length > 0 ? 'error' : 'ready',
      errors,
    } satisfies CmhcEmployeeCalculation;
  });

  return {
    rows,
    totalAmount: roundToTwoHalfUp(
      rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)
    ),
    errorCount: rows.filter((row) => row.status === 'error').length,
    hasErrors: rows.some((row) => row.status === 'error'),
  };
}
