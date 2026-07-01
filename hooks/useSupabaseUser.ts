import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface SupabaseUser {
  id: string;
  email: string | null;
  [key: string]: any;
}

export function useSupabaseUser() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (mounted) {
        setUser((session?.user as SupabaseUser) ?? null)
        setLoading(false)
      }
    }
    init()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser((session?.user as SupabaseUser) ?? null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      listener?.subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}