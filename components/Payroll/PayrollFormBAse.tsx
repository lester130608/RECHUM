// Archivo: components/PayrollFormBase.tsx
"use client";

import React from "react";

export type SupervisorType = "TCM" | "Clinician" | "BA" | "Admin";

interface PayrollFormBaseProps {
  supervisorType: SupervisorType;
  // Puedes agregar otras props según necesites (por ejemplo, para manejar el submit)
}

export default function PayrollFormBase({ supervisorType }: PayrollFormBaseProps) {
  return (
    <div className="p-4 max-w-4xl mx-auto bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">
        Payroll Form for {supervisorType} Supervisor
      </h2>
      <form>
        {/* Campos comunes */}
        <div className="mb-3">
          <label className="block font-medium">Employee ID</label>
          <input
            type="text"
            name="employeeId"
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div className="mb-3">
          <label className="block font-medium">Week Start Date</label>
          <input
            type="date"
            name="startDate"
            className="w-full p-2 border rounded"
            required
          />
        </div>

        {/* Campos específicos según el tipo de supervisor */}
        {supervisorType === "TCM" && (
          <>
            <div className="mb-3">
              <label className="block font-medium">Regular Hours</label>
              <input
                type="number"
                name="regularHours"
                className="w-full p-2 border rounded"
                min={0}
                required
              />
            </div>
            <div className="mb-3">
              <label className="block font-medium">Special Hours</label>
              <input
                type="number"
                name="specialHours"
                className="w-full p-2 border rounded"
                min={0}
              />
            </div>
          </>
        )}

        {supervisorType === "Clinician" && (
          <>
            <div className="mb-3">
              <label className="block font-medium">Service Hours</label>
              <input
                type="number"
                name="serviceHours"
                className="w-full p-2 border rounded"
                min={0}
                required
              />
            </div>
            {/* Agrega otros campos específicos para Clinicians */}
          </>
        )}

        {supervisorType === "BA" && (
          <>
            <div className="mb-3">
              <label className="block font-medium">RBT Hours</label>
              <input
                type="number"
                name="rbtHours"
                className="w-full p-2 border rounded"
                min={0}
                required
              />
            </div>
            <div className="mb-3">
              <label className="block font-medium">Assessment Hours</label>
              <input
                type="number"
                name="assessmentHours"
                className="w-full p-2 border rounded"
                min={0}
              />
            </div>
            <div className="mb-3">
              <label className="block font-medium">Reassessment Hours</label>
              <input
                type="number"
                name="reassessmentHours"
                className="w-full p-2 border rounded"
                min={0}
              />
            </div>
          </>
        )}

        {/* Para "Admin" u otros, se pueden agregar secciones particulares */}
        <button
          type="submit"
          className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Submit Payroll
        </button>
      </form>
    </div>
  );
}