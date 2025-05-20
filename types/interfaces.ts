// /types/interfaces.ts

// Interface para un Empleado
export interface Employee {
  id: string;
  nombre: string;
  // Tipo de empleado: administrativo, TCM, clinician, RBT, BCBA o BCABA
  tipo: "administrativo" | "TCM" | "clinician" | "RBT" | "BCBA" | "BCABA";
  // Referencia al supervisor asignado (por ejemplo, el ID del supervisor)
  supervisor_id: string;
  // Estado del empleado: activo o inactivo
  estado: "activo" | "inactivo";
  // Tarifa (por hora o por servicio, según el modelo de negocio)
  tarifa: number;
  // Otros atributos específicos según el tipo de empleado se pueden agregar aquí.
}

// Interface para una Nómina (Payroll)
export interface Payroll {
  id: string;
  // Referencia al empleado (Employee)
  empleado_id: string;
  // Fecha de inicio del periodo de pago (en formato ISO o Date)
  fecha_inicio: string;
  // Fecha de fin del periodo de pago
  fecha_fin: string;
  // Total de horas trabajadas en el periodo
  horas_trabajadas: number;
  // Pago total calculado (tarifa multiplicada por horas o según otros factores)
  pago_total: number;
  // Estado de la nómina: creada, enviada, aprobada o rechazada
  estado: "creada" | "enviada" | "aprobada" | "rechazada";
  // Comentarios para anotaciones o razones de rechazo (opcional)
  comentarios?: string;
}