// lib/apiAuth.ts
// Shared auth helper for API routes.
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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

  let { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (!profile && session.user.email) {
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('email', session.user.email.toLowerCase())
      .single();

    profile = userProfile;
  }

  const role = profile?.role;
  const isAuthorized =
    allowedRoles.length === 0 ||
    (typeof role === 'string' && allowedRoles.includes(role));

  return {
    isAuthorized,
    user: session.user,
    profile,
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
