// lib/apiAuth.ts
// Shared auth helper for API routes.
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { hasAnyRole } from '@/lib/auth/roleAccess';

const supabaseAdmin = getSupabaseAdmin();

export async function createAuthResponse(allowedRoles: string[] = []) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Some server contexts expose read-only cookies.
          }
        }
      }
    }
  );
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      isAuthorized: false,
      user: null,
      profile: null,
      supabase
    };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  let roleCodes: string[] = [];

  if (employee) {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('roles(code, name)')
      .eq('employee_id', employee.id)
      .eq('active', true);

    roleCodes = (userRoles || [])
      .flatMap((row: any) => [row.roles?.code, row.roles?.name])
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.toLowerCase());
  }

  const isAuthorized =
    allowedRoles.length === 0 ||
    hasAnyRole(roleCodes, allowedRoles);

  return {
    isAuthorized,
    user: session.user,
    profile: employee ? { employee_id: employee.id, roles: roleCodes } : null,
    supabase: supabaseAdmin
  };
}

// Helper to create error responses
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Insufficient permissions') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function errorResponse(message = 'Internal server error', status = 500) {
  return NextResponse.json({ error: message }, { status });
}
