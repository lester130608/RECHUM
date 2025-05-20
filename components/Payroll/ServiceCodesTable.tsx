"use client";

type ServiceCode = {
  id: string;
  code: string;
  name: string;
  rate: number;
  active: boolean;
};

type Props = {
  services: ServiceCode[];
};

export function ServiceCodesTable({ services }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-lg font-bold mb-4 text-gray-700">Service Codes</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b bg-gray-100">
              <th className="p-3">Code</th>
              <th className="p-3">Name</th>
              <th className="p-3">Rate</th>
              <th className="p-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium text-gray-800">{service.code}</td>
                <td className="p-3">{service.name}</td>
                <td className="p-3 text-green-700 font-semibold">${service.rate.toFixed(2)}</td>
                <td className="p-3">
                  {service.active ? (
                    <span className="text-green-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-red-500 font-medium">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
