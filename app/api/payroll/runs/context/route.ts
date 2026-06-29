import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  REAL_PAYROLL_ROLES,
  getSupervisedAreas,
  isOwner,
  requireAnyRole,
} from '@/lib/auth/roleAccess';

const FLORIDA_TIME_ZONE = 'America/New_York';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const owner = isOwner(auth.roleCodes);
    const today = getDateKeyInTimeZone(new Date(), FLORIDA_TIME_ZONE);

    const { data: periods, error } = await supabase
      .from('pay_periods')
      .select('id, week_code, start_date, end_date, capture_opens_at, sup_deadline, owner_deadline, submit_adp_date, pay_date, status')
      .order('pay_date', { ascending: false });

    if (error) {
      console.error('Error fetching payroll run context:', error);
      return NextResponse.json({ error: 'Failed to fetch payroll periods' }, { status: 500 });
    }

    return NextResponse.json({
      role_codes: auth.roleCodes,
      is_owner: owner,
      supervised_areas: getSupervisedAreas(auth.roleCodes),
      today,
      pay_periods: periods || [],
    });
  } catch (error) {
    console.error('GET /api/payroll/runs/context error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to calculate local date');
  }

  return `${year}-${month}-${day}`;
}
