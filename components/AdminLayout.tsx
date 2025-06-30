'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import SidebarAdmin from './SidebarAdmin'
import { useSupabaseUser } from '@/hooks/useSupabaseUser'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useSupabaseUser();
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRole = async () => {
      if (!user?.email) return;
      const { data } = await supabase
        .from('employees')
        .select('role')
        .eq('email', user.email)
        .single();
      setRole(data?.role ?? null);
      setLoading(false);
    };
    if (user) fetchRole();
  }, [user]);

  if (loading) return <p>Cargando...</p>;
  if (!user || role !== 'admin') return <p>No tienes permiso para acceder a esta página.</p>;

  return (
    <div style={{ display: 'flex' }}>
      <SidebarAdmin />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}