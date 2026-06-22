// lib/payrollEngine.ts
// Single source of truth for all payroll calculations and validations
// Date: March 2, 2026

import { getSupabaseAdmin } from './supabaseAdmin';
import type { SupabaseClient } from '@supabase/supabase-js';

type PayrollSupabaseClient = SupabaseClient<any, any, any>;

// Admin is intentionally limited to audit log writes. Payroll data reads/writes
// must use the caller's session client so Supabase RLS remains enforced.
const supabaseAdmin = getSupabaseAdmin();

// ===============================================
// TYPE DEFINITIONS
// ===============================================

export interface PayrollInputRow {
  worker_id?: string;
  worker_name?: string;
  department: 'BA' | 'TCM' | 'CMHC' | 'PSYQ';
  service_code: string;
  units?: number;
  hours?: number;
  memo?: string;
  override_rate?: number;
  week_ending: string;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  code: string;
  message: string;
  row_index?: number;
  field?: string;
  details?: any;
}

export interface PayLineDraft {
  worker_id: string;
  line_type: 'hours' | 'earning' | 'adjustment';
  code: string;
  units?: number;
  hours?: number;
  rate: number;
  amount: number;
  description?: string;
  metadata?: Record<string, any>;
}

export interface PayRunTotals {
  total_workers: number;
  total_hours: number;
  total_amount: number;
  total_exceptions: number;
  by_department: Record<string, {
    workers: number;
    hours: number;
    amount: number;
  }>;
}

export interface ADPExportRow {
  adp_worker_id: string;
  file_number?: string;
  worker_name: string;
  earning_code: string;
  hours?: number;
  amount?: number;
  memo?: string;
}

export interface ValidationContext {
  pay_run_id: string;
  department: string;
  submitted_by: string;
}

export interface NormalizedPayrollRow {
  worker_id: string;
  worker_name: string;
  department: string;
  service_code: string;
  units: number;
  hours: number;
  rate: number;
  amount: number;
  memo?: string;
}

// ===============================================
// VALIDATION ENGINE
// ===============================================

export async function validatePayrollInputs(
  supabase: PayrollSupabaseClient,
  payload: PayrollInputRow[], 
  context: ValidationContext
): Promise<{ issues: ValidationIssue[], normalizedRows: NormalizedPayrollRow[] }> {
  const issues: ValidationIssue[] = [];
  const normalizedRows: NormalizedPayrollRow[] = [];
  
  // Get active workers for validation
  const { data: workers, error: workersError } = await supabase
    .from('employees')
    .select('id, first_name, last_name, full_name, adp_worker_id, file_number, status')
    .eq('status', 'active');

  if (workersError) {
    issues.push({
      type: 'error',
      code: 'WORKERS_FETCH_ERROR',
      message: 'Failed to fetch workers for validation'
    });
    return { issues, normalizedRows };
  }

  // Get active rate cards for the department
  const { data: rateCards, error: rateCardsError } = await supabase
    .from('rate_cards')
    .select('*')
    .eq('department', context.department)
    .eq('active', true)
    .lte('effective_from', new Date().toISOString().split('T')[0]);

  if (rateCardsError) {
    issues.push({
      type: 'error',
      code: 'RATE_CARDS_FETCH_ERROR',
      message: 'Failed to fetch rate cards for validation'
    });
    return { issues, normalizedRows };
  }

  // Track processed workers to detect duplicates
  const processedWorkerCodes = new Set<string>();

  for (let i = 0; i < payload.length; i++) {
    const row = payload[i];
    
    // Skip empty rows
    if (!row.worker_name && !row.worker_id && !row.service_code) {
      continue;
    }

    // Find matching worker
    let worker = null;
    if (row.worker_id) {
      worker = workers.find(w => w.id === row.worker_id);
    } else if (row.worker_name) {
      worker = workers.find(w => 
        w.full_name?.toLowerCase().includes(row.worker_name.toLowerCase()) ||
        `${w.first_name} ${w.last_name}`.toLowerCase().includes(row.worker_name.toLowerCase())
      );
    }

    // HARD ERROR: Missing worker match
    if (!worker) {
      issues.push({
        type: 'error',
        code: 'WORKER_NOT_FOUND',
        message: `Worker not found: ${row.worker_name || row.worker_id}`,
        row_index: i,
        field: 'worker'
      });
      continue;
    }

    // HARD ERROR: Worker missing ADP identifier
    if (!worker.adp_worker_id && !worker.file_number) {
      issues.push({
        type: 'error',
        code: 'MISSING_ADP_ID',
        message: `Worker ${worker.full_name} is missing ADP worker ID or file number`,
        row_index: i,
        field: 'worker'
      });
      continue;
    }

    // Find rate card
    const rateCard = rateCards.find(rc => 
      rc.service_code === row.service_code &&
      (rc.worker_id === worker.id || rc.worker_id === null) &&
      (!rc.effective_to || rc.effective_to >= new Date().toISOString().split('T')[0])
    );

    // HARD ERROR: Missing rate card
    if (!rateCard && !row.override_rate) {
      issues.push({
        type: 'error',
        code: 'RATE_CARD_NOT_FOUND',
        message: `No rate card found for ${row.service_code} in ${context.department}`,
        row_index: i,
        field: 'service_code'
      });
      continue;
    }

    const rate = row.override_rate || (rateCard ? rateCard.rate : 0);
    const units = row.units || 0;
    const hours = row.hours || 0;

    // HARD ERROR: Negative values
    if (units < 0 || hours < 0) {
      issues.push({
        type: 'error',
        code: 'NEGATIVE_VALUES',
        message: 'Hours and units must be non-negative',
        row_index: i,
        field: units < 0 ? 'units' : 'hours'
      });
      continue;
    }

    // WARNING: Extreme outliers
    if (hours > 90) {
      issues.push({
        type: 'warning',
        code: 'HIGH_HOURS',
        message: `Unusually high hours: ${hours}`,
        row_index: i,
        field: 'hours'
      });
    }

    // Check for duplicates
    const workerCodeKey = `${worker.id}-${row.service_code}-${context.pay_run_id}`;
    if (processedWorkerCodes.has(workerCodeKey)) {
      issues.push({
        type: 'error',
        code: 'DUPLICATE_ENTRY',
        message: `Duplicate entry for ${worker.full_name} - ${row.service_code}`,
        row_index: i
      });
      continue;
    }
    processedWorkerCodes.add(workerCodeKey);

    // Calculate amount based on rate card pay method
    let amount = 0;
    let finalUnits = units;
    let finalHours = hours;

    if (rateCard) {
      switch (rateCard.pay_method) {
        case 'hourly':
          amount = finalHours * rate;
          break;
        case 'per_unit':
          amount = finalUnits * rate;
          break;
        case 'flat':
          amount = rate;
          break;
      }
    } else {
      // Override rate - assume hourly
      amount = finalHours * rate;
    }

    // Add to normalized rows
    normalizedRows.push({
      worker_id: worker.id,
      worker_name: worker.full_name || `${worker.first_name} ${worker.last_name}`,
      department: context.department,
      service_code: row.service_code,
      units: finalUnits,
      hours: finalHours,
      rate,
      amount,
      memo: row.memo
    });

    // WARNING: Rate changed (check against previous runs)
    if (rateCard && row.override_rate && Math.abs(row.override_rate - rateCard.rate) > 0.01) {
      issues.push({
        type: 'warning',
        code: 'RATE_OVERRIDE',
        message: `Rate override: $${row.override_rate} vs standard $${rateCard.rate}`,
        row_index: i,
        field: 'rate'
      });
    }
  }

  return { issues, normalizedRows };
}

// ===============================================
// PAY LINES GENERATION
// ===============================================

export function generatePayLines(
  normalizedRows: NormalizedPayrollRow[],
  rateCards: any[]
): PayLineDraft[] {
  const payLines: PayLineDraft[] = [];

  for (const row of normalizedRows) {
    const rateCard = rateCards.find(rc => 
      rc.service_code === row.service_code &&
      (rc.worker_id === row.worker_id || rc.worker_id === null)
    );

    // Determine line type based on service code
    let lineType: 'hours' | 'earning' | 'adjustment' = 'hours';
    
    // Special codes that are typically earnings/adjustments
    if (['BONUS', 'ADJUSTMENT', 'REIMB'].includes(row.service_code.toUpperCase())) {
      lineType = 'adjustment';
    } else if (['COMMISSION', 'INCENTIVE'].includes(row.service_code.toUpperCase())) {
      lineType = 'earning';
    }

    payLines.push({
      worker_id: row.worker_id,
      line_type: lineType,
      code: row.service_code,
      units: row.units > 0 ? row.units : undefined,
      hours: row.hours > 0 ? row.hours : undefined,
      rate: row.rate,
      amount: row.amount,
      description: row.memo,
      metadata: {
        department: row.department,
        pay_method: rateCard?.pay_method || 'hourly'
      }
    });
  }

  return payLines;
}

// ===============================================
// TOTALS CALCULATION
// ===============================================

export function calculateItemTotals(lines: PayLineDraft[]): { total_hours: number, total_amount: number } {
  const total_hours = lines
    .filter(line => line.hours)
    .reduce((sum, line) => sum + (line.hours || 0), 0);
  
  const total_amount = lines
    .reduce((sum, line) => sum + line.amount, 0);

  return { total_hours, total_amount };
}

// ===============================================
// ADP EXPORT
// ===============================================

export async function buildADPExport(
  payRunId: string,
  supabase: PayrollSupabaseClient
): Promise<ADPExportRow[]> {
  // Get all pay lines for the pay run with worker info
  const { data: payLinesData, error } = await supabase
    .from('pay_lines')
    .select(`
      *,
      pay_run_items!inner (
        worker_id,
        pay_runs!inner (
          id,
          week_ending,
          status
        )
      ),
      employees!pay_run_items_worker_id_fkey (
        adp_worker_id,
        file_number,
        full_name,
        first_name,
        last_name
      )
    `)
    .eq('pay_run_items.pay_runs.id', payRunId);

  if (error) {
    throw new Error(`Failed to fetch pay lines: ${error.message}`);
  }

  const exportRows: ADPExportRow[] = [];

  for (const line of payLinesData || []) {
    const worker = line.employees;
    const adpId = worker.adp_worker_id || worker.file_number;
    
    if (!adpId) {
      console.warn(`Skipping worker ${worker.full_name}: missing ADP identifier`);
      continue;
    }

    exportRows.push({
      adp_worker_id: adpId,
      file_number: worker.file_number,
      worker_name: worker.full_name || `${worker.first_name} ${worker.last_name}`,
      earning_code: line.code,
      hours: line.line_type === 'hours' ? line.hours : undefined,
      amount: line.line_type !== 'hours' ? line.amount : undefined,
      memo: line.description
    });
  }

  return exportRows;
}

// ===============================================
// MAIN CALCULATION ENGINE
// ===============================================

export async function applyPayrollRunCalculation(
  payRunId: string, 
  supabase: PayrollSupabaseClient,
  actorId: string
): Promise<{ success: boolean, issues: ValidationIssue[], totals?: PayRunTotals }> {
  try {
    // 1. Get pay run status
    const { data: payRun, error: payRunError } = await supabase
      .from('pay_runs')
      .select('status, week_ending')
      .eq('id', payRunId)
      .single();

    if (payRunError || !payRun) {
      return { success: false, issues: [{ type: 'error', code: 'PAY_RUN_NOT_FOUND', message: 'Pay run not found' }] };
    }

    if (['exported', 'locked'].includes(payRun.status)) {
      return { success: false, issues: [{ type: 'error', code: 'PAY_RUN_LOCKED', message: 'Cannot modify locked or exported pay run' }] };
    }

    // 2. Get all payroll inputs for this run
    const { data: inputs, error: inputsError } = await supabase
      .from('payroll_inputs')
      .select('*')
      .eq('pay_run_id', payRunId);

    if (inputsError) {
      return { success: false, issues: [{ type: 'error', code: 'INPUTS_FETCH_ERROR', message: 'Failed to fetch payroll inputs' }] };
    }

    const allIssues: ValidationIssue[] = [];
    const allNormalizedRows: NormalizedPayrollRow[] = [];

    // 3. Process each input submission
    for (const input of inputs || []) {
      const context: ValidationContext = {
        pay_run_id: payRunId,
        department: input.department,
        submitted_by: input.submitted_by
      };

      const { issues, normalizedRows } = await validatePayrollInputs(supabase, input.payload, context);
      allIssues.push(...issues);
      allNormalizedRows.push(...normalizedRows);
    }

    // 4. Get rate cards for pay line generation
    const { data: rateCards } = await supabase
      .from('rate_cards')
      .select('*')
      .eq('active', true);

    // 5. Generate pay lines
    const payLines = generatePayLines(allNormalizedRows, rateCards || []);

    // 6. Group by worker and create/update pay_run_items
    const workerGroups = new Map<string, PayLineDraft[]>();
    payLines.forEach(line => {
      if (!workerGroups.has(line.worker_id)) {
        workerGroups.set(line.worker_id, []);
      }
      workerGroups.get(line.worker_id)!.push(line);
    });

    // 7. Delete existing pay lines and items for this run through RLS.
    const { data: existingItems, error: existingItemsError } = await supabase
      .from('pay_run_items')
      .select('id')
      .eq('pay_run_id', payRunId);

    if (existingItemsError) {
      return { success: false, issues: [{ type: 'error', code: 'ITEMS_FETCH_ERROR', message: 'Failed to fetch existing pay run items' }] };
    }

    const existingItemIds = (existingItems || []).map((item: { id: string }) => item.id);

    if (existingItemIds.length > 0) {
      const { error: deleteLinesError } = await supabase
        .from('pay_lines')
        .delete()
        .in('pay_run_item_id', existingItemIds);

      if (deleteLinesError) {
        return { success: false, issues: [{ type: 'error', code: 'PAY_LINES_DELETE_ERROR', message: 'Failed to clear existing pay lines' }] };
      }
    }

    const { error: deleteItemsError } = await supabase
      .from('pay_run_items')
      .delete()
      .eq('pay_run_id', payRunId);

    if (deleteItemsError) {
      return { success: false, issues: [{ type: 'error', code: 'PAY_RUN_ITEMS_DELETE_ERROR', message: 'Failed to clear existing pay run items' }] };
    }

    const totals: PayRunTotals = {
      total_workers: workerGroups.size,
      total_hours: 0,
      total_amount: 0,
      total_exceptions: allIssues.filter(i => i.type === 'error').length,
      by_department: {}
    };

    // 8. Insert new pay_run_items and pay_lines
    for (const [workerId, lines] of workerGroups) {
      const workerTotals = calculateItemTotals(lines);
      const workerIssues = allIssues.filter(issue => 
        lines.some(line => line.worker_id === workerId)
      );
      
      // Insert pay run item
      const { data: payRunItem, error: itemError } = await supabase
        .from('pay_run_items')
        .insert({
          pay_run_id: payRunId,
          worker_id: workerId,
          status: workerIssues.some(i => i.type === 'error') ? 'needs_fix' : 'ready',
          calc_total_hours: workerTotals.total_hours,
          calc_total_amount: workerTotals.total_amount,
          exceptions_count: workerIssues.length
        })
        .select('id')
        .single();

      if (itemError || !payRunItem) {
        console.error('Failed to insert pay run item:', itemError);
        continue;
      }

      // Insert pay lines
      const linesWithItemId = lines.map(line => ({
        ...line,
        pay_run_item_id: payRunItem.id,
        created_by: actorId
      }));

      const { error: linesError } = await supabase
        .from('pay_lines')
        .insert(linesWithItemId);

      if (linesError) {
        console.error('Failed to insert pay lines:', linesError);
      }

      // Update totals
      totals.total_hours += workerTotals.total_hours;
      totals.total_amount += workerTotals.total_amount;

      // Group by department for reporting
      lines.forEach(line => {
        const dept = line.metadata?.department || 'UNKNOWN';
        if (!totals.by_department[dept]) {
          totals.by_department[dept] = { workers: 0, hours: 0, amount: 0 };
        }
        // Only count each worker once per department
        if (!totals.by_department[dept].workers) {
          totals.by_department[dept].workers++;
        }
        totals.by_department[dept].hours += line.hours || 0;
        totals.by_department[dept].amount += line.amount;
      });
    }

    // 9. Update pay run with calculation metadata
    await supabase
      .from('pay_runs')
      .update({
        last_calculated_at: new Date().toISOString(),
        calculation_metadata: {
          total_inputs: inputs?.length || 0,
          calculation_timestamp: new Date().toISOString(),
          calculated_by: actorId
        }
      })
      .eq('id', payRunId);

    // 10. Log the calculation
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        entity_type: 'pay_run',
        entity_id: payRunId,
        action: 'calculate',
        after_data: { totals },
        actor_id: actorId
      });

    return { 
      success: true, 
      issues: allIssues,
      totals 
    };

  } catch (error: any) {
    console.error('Payroll calculation error:', error);
    return { 
      success: false, 
      issues: [{ 
        type: 'error', 
        code: 'CALCULATION_ERROR', 
        message: error.message || 'Unknown calculation error' 
      }] 
    };
  }
}
