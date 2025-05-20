"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function ServiceCodeForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("service_codes").insert([
      {
        code,
        name,
        rate: parseFloat(rate),
        active,
      },
    ]);

    setLoading(false);

    if (error) {
      alert("Error saving service: " + error.message);
    } else {
      alert("Service saved successfully!");
      setCode("");
      setName("");
      setRate("");
      setActive(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 mb-6">
      <h2 className="text-lg font-bold mb-4 text-gray-700">Add New Service Code</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rate</label>
          <input
            type="number"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-full border p-2 rounded"
            step="0.01"
            required
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4"
            />
            Active
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save Service"}
      </button>
    </form>
  );
}
