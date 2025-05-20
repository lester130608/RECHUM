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
