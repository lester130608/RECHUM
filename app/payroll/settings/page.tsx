"use client";

import { useEffect, useState } from 'react';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';

async function fetchContext() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Auth session missing. Please log in again.');
  }

  const response = await fetch('/api/payroll/runs/context', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return data;
}

export default function PayrollSettingsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validateOwner = async () => {
      try {
        const context = await fetchContext();
        if (!context.is_owner) {
          window.location.href = '/not-authorized';
          return;
        }
      } catch {
        window.location.href = '/not-authorized';
        return;
      } finally {
        setLoading(false);
      }
    };

    void validateOwner();
  }, []);

  return (
    <PayrollShell currentLabel="Settings">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Settings</h1>
          <p className="subtitle">Coming soon.</p>
        </div>
      </div>

      <div className="section">
        <div className="empty-state">{loading ? 'Loading...' : 'Settings - coming soon.'}</div>
      </div>
    </PayrollShell>
  );
}
