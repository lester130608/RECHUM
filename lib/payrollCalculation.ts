// /lib/payrollCalculation.ts

export interface PayrollCalculationParams {
    hoursWorked: number;    // Horas trabajadas en el periodo
    hourlyRate: number;     // Tarifa por hora del empleado
    serviceCount?: number;  // Número de servicios prestados (opcional)
    serviceRate?: number;   // Tarifa por servicio (opcional)
  }
  
  export function calculatePayroll({
    hoursWorked,
    hourlyRate,
    serviceCount = 0,
    serviceRate = 0,
  }: PayrollCalculationParams): number {
    const hourlyPayment = hoursWorked * hourlyRate;
    const servicePayment = serviceCount * serviceRate;
    return hourlyPayment + servicePayment;
  }