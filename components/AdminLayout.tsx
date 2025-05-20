'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { supabase } from '@/lib/supabase'
import SidebarAdmin from './SidebarAdmin'
import ClientWrapper from './ClientWrapper'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRole = async () => {
      if (status !== 'authenticated' || !session?.user?.email) return

      const { data } = await supabase
        .from('employees')
        .select('role')
        .eq('email', session.user.email)
        .single()

      if (data?.role) setRole(data.role)
      setLoading(false)
    }

    fetchRole()
  }, [session, status])

  if (loading) return <p className="p-4">Cargando...</p>

  const isAdmin = role === 'admin' || role === 'supervisor'

  return (
    <div className="flex">
      {isAdmin && <SidebarAdmin />}
      <div className={isAdmin ? 'ml-64 flex-1 p-4' : 'w-full p-4'}>
        <ClientWrapper>{children}</ClientWrapper>
      </div>
    </div>
  )
}