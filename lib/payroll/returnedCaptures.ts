// ---------------------------------------------------------------------------
// lib/payroll/returnedCaptures.ts
//
// Una captura devuelta por el owner (payroll_inputs.status = 'rejected',
// ver migración 0019) tiene que poder corregirse aunque la ventana de
// captura del supervisor ya haya cerrado: la devolución llega, por
// definición, después del deadline. Estas dos funciones son lo que las
// rutas de captura (BA, CMHC, TCM) consultan para saltarse la ventana solo
// en ese caso.
// ---------------------------------------------------------------------------

// Periodos del área que tienen una captura devuelta y pendiente de corregir.
export async function returnedPeriodIds(supabase: any, area: string): Promise<Set<string>> {
  const { data: inputs, error } = await supabase
    .from('payroll_inputs')
    .select('pay_run_id')
    .eq('department', area)
    .eq('status', 'rejected');

  if (error || !inputs || inputs.length === 0) {
    return new Set();
  }

  const runIds = inputs.map((row: { pay_run_id: string }) => row.pay_run_id);
  const { data: runs } = await supabase
    .from('pay_runs')
    .select('period_id')
    .in('id', runIds)
    .eq('area', area)
    .eq('run_level', 'area');

  return new Set((runs ?? []).map((row: { period_id: string }) => row.period_id));
}

export async function isCaptureReturned(supabase: any, periodId: string, area: string): Promise<boolean> {
  const { data: run } = await supabase
    .from('pay_runs')
    .select('id')
    .eq('period_id', periodId)
    .eq('area', area)
    .eq('run_level', 'area')
    .maybeSingle();

  if (!run) {
    return false;
  }

  const { data: input } = await supabase
    .from('payroll_inputs')
    .select('status')
    .eq('pay_run_id', run.id)
    .eq('department', area)
    .maybeSingle();

  return input?.status === 'rejected';
}
