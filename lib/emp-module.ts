import type { RateDecisionType } from './types/emp-module';

/**
 * Determina si un pay_period está en ventana de captura activa.
 * Ventana: capture_opens_at <= hoy <= pay_date
 * Y status != LOCKED ni EXPORTED
 */
export function isPayPeriodActive(
  payPeriod: {
    capture_opens_at: string;
    pay_date: string;
    status: string;
  },
  today: Date = new Date()
): boolean {
  const todayStr = today.toISOString().slice(0, 10);
  
  if (payPeriod.status === 'LOCKED' || payPeriod.status === 'EXPORTED') {
    return false;
  }
  
  return (
    payPeriod.capture_opens_at <= todayStr &&
    todayStr <= payPeriod.pay_date
  );
}

/**
 * Determina si el supervisor ya pasó el cutoff (sup_deadline).
 * Si pasó, supervisor no debería poder editar.
 */
export function isPastSupCutoff(
  payPeriod: { sup_deadline: string },
  today: Date = new Date()
): boolean {
  const todayStr = today.toISOString().slice(0, 10);
  return todayStr > payPeriod.sup_deadline;
}

/**
 * Detecta si hay un rate change durante un pay period
 * Retorna las configs viejas y nuevas si hay conflicto
 */
export async function detectRateConflict(
  supabase: any,
  employeeId: string,
  periodStart: string,
  periodEnd: string
): Promise<{
  hasConflict: boolean;
  oldRate: number | null;
  newRate: number | null;
  changeDate: string | null;
}> {
  const { data: configs } = await supabase
    .from('pay_role_configs')
    .select('id, valid_from, valid_to, active, role, pay_role_rates(rate_key, rate_value)')
    .eq('employee_id', employeeId)
    .eq('role', 'EMPLOYEE')
    .or(`valid_from.lte.${periodEnd},valid_to.gte.${periodStart},valid_to.is.null`)
    .order('valid_from', { ascending: true });

  if (!configs || configs.length === 0) {
    return { hasConflict: false, oldRate: null, newRate: null, changeDate: null };
  }

  // Buscar configs vigentes durante el período
  const relevant = configs.filter((c: any) => {
    const validFrom = c.valid_from;
    const validTo = c.valid_to || '9999-12-31';
    return validFrom <= periodEnd && validTo >= periodStart;
  });

  if (relevant.length <= 1) {
    return { hasConflict: false, oldRate: null, newRate: null, changeDate: null };
  }

  // Hay más de una config activa durante el período -> conflicto
  const oldConfig = relevant[0];
  const newConfig = relevant[1];
  const oldHourly = oldConfig.pay_role_rates?.find((r: any) => r.rate_key === 'HOURLY');
  const newHourly = newConfig.pay_role_rates?.find((r: any) => r.rate_key === 'HOURLY');

  return {
    hasConflict: true,
    oldRate: oldHourly?.rate_value || null,
    newRate: newHourly?.rate_value || null,
    changeDate: newConfig.valid_from,
  };
}

/**
 * Calcula el subtotal según decisión de rate
 */
export function calculateSubtotal(
  hours: number | null,
  rateDecision: RateDecisionType,
  rateOld: number | null,
  rateNew: number | null,
  rateUsed: number | null,
  prorateDate: string | null,
  periodStart: string,
  periodEnd: string,
  fixedAmount: number | null
): { subtotal: number; rateUsed: number | null; note: string } {
  if (rateDecision === 'fixed_salary' && fixedAmount) {
    return { subtotal: fixedAmount, rateUsed: null, note: 'Fixed salary' };
  }

  if (rateDecision === 'auto_single' && rateUsed && hours !== null) {
    return {
      subtotal: hours * rateUsed,
      rateUsed,
      note: `${hours}h x $${rateUsed}`,
    };
  }

  if (rateDecision === 'manual_old' && rateOld && hours !== null) {
    return {
      subtotal: hours * rateOld,
      rateUsed: rateOld,
      note: `Used old rate $${rateOld} for all ${hours}h`,
    };
  }

  if (rateDecision === 'manual_new' && rateNew && hours !== null) {
    return {
      subtotal: hours * rateNew,
      rateUsed: rateNew,
      note: `Used new rate $${rateNew} for all ${hours}h`,
    };
  }

  if (
    rateDecision === 'manual_prorate' &&
    rateOld &&
    rateNew &&
    hours !== null &&
    prorateDate
  ) {
    // Calcular días totales y días con rate viejo / nuevo
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const change = new Date(prorateDate);
    
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const oldDays = Math.max(0, Math.ceil((change.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const newDays = totalDays - oldDays;
    
    const hoursOld = hours * (oldDays / totalDays);
    const hoursNew = hours * (newDays / totalDays);
    const subtotal = hoursOld * rateOld + hoursNew * rateNew;
    
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      rateUsed: null,
      note: `Pro-rate: ${hoursOld.toFixed(2)}h x $${rateOld} + ${hoursNew.toFixed(2)}h x $${rateNew}`,
    };
  }

  return { subtotal: 0, rateUsed: null, note: 'Incomplete' };
}
