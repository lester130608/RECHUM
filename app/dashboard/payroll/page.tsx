"use client";

import React, { useState } from 'react';
import PayrollCreator from './PayrollCreator';

export default function PayrollDashboard() {
  const [showCreator, setShowCreator] = useState(false);

  return (
    <div style={{padding:'2rem'}}>
      <h1 style={{fontSize:'2rem', fontWeight:700, marginBottom:'2rem'}}>Gestión de Payroll</h1>
      <button onClick={() => setShowCreator(true)} style={{background:'#2563eb', color:'#fff', border:'none', borderRadius:10, padding:'1rem 2rem', fontWeight:700, fontSize:'1.15rem', cursor:'pointer', marginBottom:'2rem'}}>Nuevo Payroll</button>
      {/* Placeholder para lista de payrolls anteriores */}
      <div style={{marginBottom:'2rem'}}>
        <h2 style={{fontSize:'1.25rem', fontWeight:600}}>Payrolls anteriores</h2>
        <div style={{color:'#888'}}>Aquí aparecerán los payrolls generados previamente.</div>
      </div>
      {showCreator && (
        <PayrollCreator onClose={() => setShowCreator(false)} />
      )}
    </div>
  );
}
