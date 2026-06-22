import { jsonError } from '@/lib/pay-config';

export async function POST() {
  return jsonError('Legacy owner unlock is read-only. Use pay_runs for new payroll operations.', 405);
}
