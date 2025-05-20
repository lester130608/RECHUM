"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ServiceCode = {
  id: string;
  code: string;
  name: string;
  rate: number;
};

export default function ServiceCodesSettings() {
  const [services, setServices] = useState<ServiceCode[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchServices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service_codes")
      .select("id, code, name, rate")
      .order("code");

    if (error) {
      alert("Error fetching services");
    } else {
      setServices(data || []);
    }
    setLoading(false);
  };

  const updateRate = async (id: string, rate: number) => {
    const { error } = await supabase
      .from("service_codes")
      .update({ rate })
      .eq("id", id);

    if (error) {
      alert("Error updating rate");
    } else {
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, rate } : s))
      );
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Service Code Rates</h2>
      <table className="min-w-full text-sm bg-white rounded shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 text-left">Code</th>
            <th className="p-3 text-left">Name</th>
            <th className="p-3 text-left">Rate ($)</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-b hover:bg-gray-50">
              <td className="p-3">{s.code}</td>
              <td className="p-3">{s.name}</td>
              <td className="p-3">
                <input
                  type="number"
                  step="0.01"
                  className="border px-2 py-1 rounded w-24"
                  value={s.rate}
                  onChange={(e) =>
                    updateRate(s.id, parseFloat(e.target.value))
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {loading && <p className="text-sm mt-4 text-gray-500">Loading...</p>}
    </div>
  );
}
