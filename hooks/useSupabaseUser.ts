import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useSupabaseUser() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user)
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