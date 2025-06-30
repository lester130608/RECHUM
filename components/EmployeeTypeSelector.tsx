'use client';

import React from "react";

export default function EmployeeTypeSelector({ onSelect }: { onSelect: (type: "w2" | "1099") => void }) {
  return (
    <div style={{ textAlign: "center", margin: "2rem" }}>
      <h2>¿Qué tipo de empleado deseas crear?</h2>
      <button
        style={{ margin: 16, padding: "1rem 2rem", fontSize: 18 }}
        onClick={() => onSelect("w2")}
      >
        Empleado W-2
      </button>
      <button
        style={{ margin: 16, padding: "1rem 2rem", fontSize: 18 }}
        onClick={() => onSelect("1099")}
      >
        Contratista 1099
      </button>
    </div>
  );
}