import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface SupabaseUser {
  id: string;
  aud: string;
  email: string | null;
  phone: string | null;
  app_metadata: Record<string, any>;
  user_metadata: Record<string, any>;
  created_at: string;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  last_sign_in_at: string | null;
  role: string;
  updated_at: string;
}

export function useSupabaseUser() {
  const [user, setUser] = useState<SupabaseUser | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user as SupabaseUser)
    }
    getUser()
    // Escucha cambios de sesión
    const { data: listener } = supabase.auth.onAuthStateChange(() => getUser())
    return () => {
      listener?.subscription.unsubscribe()
    }
  }, [])

  return user
}