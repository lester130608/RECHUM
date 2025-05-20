// components/DashboardCards.tsx
"use client";

import KPICard from "./KPICard";
import { FaUsers, FaDollarSign, FaClock } from "react-icons/fa";

export default function DashboardCards() {
  // Valores de ejemplo (puedes reemplazarlos por datos dinámicos)
  const totalEmployees = 120;
  const pendingApprovals = 8;
  const totalHoursWorked = 3500;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <KPICard
        title="Total Employees"
        value={totalEmployees}
        icon={<FaUsers />}
      />
      <KPICard
        title="Pending Approvals"
        value={pendingApprovals}
        icon={<FaDollarSign />}
      />
      <KPICard
        title="Total Hours Worked"
        value={totalHoursWorked}
        icon={<FaClock />}
      />
    </div>
  );
}