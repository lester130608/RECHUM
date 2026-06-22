import { jsonError } from '@/lib/pay-config';

export async function POST() {
  return jsonError('Legacy owner approval is read-only. Use pay_runs approval for new payroll operations.', 405);
}
