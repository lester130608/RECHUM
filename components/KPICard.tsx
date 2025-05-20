// components/KPICard.tsx
"use client";

interface KPICardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
}

export default function KPICard({ title, value, icon }: KPICardProps) {
  return (
    <div className="bg-white shadow rounded-lg p-4 flex items-center">
      {icon && <div className="text-3xl mr-4">{icon}</div>}
      <div>
        <p className="text-gray-500">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}