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
