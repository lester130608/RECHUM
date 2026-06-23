// app/api/payroll/runs/[id]/export/route.ts
// API route for ADP export generation
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { buildADPExport } from '@/lib/payrollEngine';
import { requireAnyRole } from '@/lib/auth/roleAccess';

// GET: Generate and download ADP export CSV
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const payRunId = params.id;

    // Verify pay run exists and is approved
    const { data: payRun, error: payRunError } = await supabase
      .from('pay_runs')
      .select('status, week_ending, exported_at')
      .eq('id', payRunId)
      .single();

    if (payRunError || !payRun) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }

    if (!['owner_approved'].includes(payRun.status)) {
      return NextResponse.json({ 
        error: `Cannot export pay run with status: ${payRun.status}. Must be owner_approved first.`
      }, { status: 400 });
    }

    // Check for items that still need fixing
    const { data: itemsWithErrors, error: itemsError } = await supabase
      .from('pay_run_items')
      .select('id')
      .eq('pay_run_id', payRunId)
      .eq('status', 'needs_fix');

    if (itemsError) {
      return NextResponse.json({ error: 'Failed to validate pay run items' }, { status: 500 });
    }

    if (itemsWithErrors && itemsWithErrors.length > 0) {
      return NextResponse.json({ 
        error: `Cannot export pay run: ${itemsWithErrors.length} items still need to be fixed`
      }, { status: 400 });
    }

    console.log(`Generating ADP export for pay run ${payRunId}...`);

    // Generate ADP export data
    const exportRows = await buildADPExport(payRunId, supabase);

    if (exportRows.length === 0) {
      return NextResponse.json({ 
        error: 'No exportable data found for this pay run' 
      }, { status: 400 });
    }

    // Generate CSV content
    const csvHeader = 'ADP Worker ID,File Number,Worker Name,Earning Code,Hours,Amount,Memo\n';
    const csvRows = exportRows.map(row => {
      return [
        row.adp_worker_id || '',
        row.file_number || '',
        `"${row.worker_name}"`,
        row.earning_code,
        row.hours || '',
        row.amount || '',
        `"${row.memo || ''}"`
      ].join(',');
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    // Update pay run status to exported
    const { error: updateError } = await supabase
      .from('pay_runs')
      .update({
        status: 'exported',
        exported_at: new Date().toISOString()
      })
      .eq('id', payRunId);

    if (updateError) {
      console.error('Error updating pay run to exported:', updateError);
      // Continue with export even if status update fails
    }

    // Log the export
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'pay_run',
        entity_id: payRunId,
        action: 'export',
        before_data: { status: payRun.status },
        after_data: { 
          status: 'exported',
          export_row_count: exportRows.length,
          exported_at: new Date().toISOString()
        },
        actor_id: auth.userId
      });

    console.log(`ADP export completed for pay run ${payRunId}. ${exportRows.length} rows exported.`);

    // Generate filename
    const weekEndingFormatted = new Date(payRun.week_ending).toISOString().split('T')[0];
    const filename = `payroll_export_${weekEndingFormatted}.csv`;

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': csvContent.length.toString()
      }
    });

  } catch (error: any) {
    console.error('GET /api/payroll/runs/[id]/export error:', error);
    return NextResponse.json({ 
      error: 'Export failed', 
      details: error.message 
    }, { status: 500 });
  }
}

// POST: Preview ADP export (without downloading)
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const payRunId = params.id;

    // Generate preview data (same as export but don't update status)
    const exportRows = await buildADPExport(payRunId, supabase);

    // Return preview data
    return NextResponse.json({
      preview: exportRows,
      total_rows: exportRows.length,
      total_amount: exportRows.reduce((sum, row) => sum + (row.amount || 0), 0)
    });

  } catch (error: any) {
    console.error('POST /api/payroll/runs/[id]/export error:', error);
    return NextResponse.json({ 
      error: 'Preview failed', 
      details: error.message 
    }, { status: 500 });
  }
}
