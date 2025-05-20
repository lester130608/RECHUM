"use client";

type PayrollItem = {
  date: string;
  amount: number;
  period: string;
};

type PayrollTableProps = {
  data: PayrollItem[];
};

export function PayrollTable({ data }: PayrollTableProps) {
  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-lg font-bold mb-4 text-gray-700">Payroll History (Details)</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-3">Check Date</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Pay Period</th>
              <th className="p-3">Schedule</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, idx) => (
              <tr key={idx} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium text-gray-700">{item.date}</td>
                <td className="p-3 text-green-600 font-semibold">
                  ${item.amount.toLocaleString()}
                </td>
                <td className="p-3">{item.period}</td>
                <td className="p-3">Biweekly</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
