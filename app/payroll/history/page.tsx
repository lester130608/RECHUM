"use client";

import { PayrollShell } from '@/components/Payroll/PayrollShell';

export default function PayrollHistoryPage() {
  return (
    <PayrollShell currentLabel="History">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>History</h1>
          <p className="subtitle">Coming soon - past payrolls will appear here.</p>
        </div>
      </div>

      <div className="section">
        <div className="empty-state">History - coming soon.</div>
      </div>
    </PayrollShell>
  );
}
