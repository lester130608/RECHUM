import { jsonError } from '@/lib/pay-config';

export async function POST() {
  return jsonError('Legacy owner export is read-only. Use pay_runs export for new payroll operations.', 405);
}
