#!/bin/bash

mkdir -p components/Payroll

# PayrollCard
cat > components/Payroll/PayrollCard.tsx << 'EOF'
type Props = {
  nextCheck: string;
  period: string;
  schedule: string;
};

export function PayrollCard({ nextCheck, period, schedule }: Props) {
  return (
    <div className="bg-white border rounded-2xl p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-700 mb-2">Next Check</h2>
      <p className="text-2xl font-bold text-teal-600">{nextCheck}</p>
      <p className="text-sm text-gray-500 mt-1">Pay period: {period}</p>
      <p className="text-sm text-gray-500">Schedule: {schedule}</p>
    </div>
  );
}
EOF

# PayrollGraph
cat > components/Payroll/PayrollGraph.tsx << 'EOF'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";

type HistoryItem = {
  date: string;
  amount: number;
};

type Props = {
  data: HistoryItem[];
};

export function PayrollGraph({ data }: Props) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow">
      <h2 className="text-lg font-bold mb-4 text-gray-700">Payroll History (Graph)</h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="date" />
          <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
          <Bar dataKey="amount" fill="#5b21b6" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
EOF

# index.ts
cat > components/Payroll/index.ts << 'EOF'
export * from "./PayrollCard";
export * from "./PayrollGraph";
export * from "./PayrollTable";
export * from "./PayrollForm";
export * from "./PayrollFormBAse";
export * from "./TCMPayrollForm";
EOF

echo "✅ Archivos creados en components/Payroll"
ß