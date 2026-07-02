"use client";

import { PayrollShell } from '@/components/Payroll/PayrollShell';

export default function PayrollRunsLayout({ children }: { children: React.ReactNode }) {
  return <PayrollShell currentLabel="Pay Runs">{children}</PayrollShell>;
}
