"use client";
import React, { useState } from 'react';

export default function PayrollCreator({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [payStart, setPayStart] = useState('');
  const [payEnd, setPayEnd] = useState('');
  const [payFor, setPayFor] = useState('');
  const [status, setStatus] = useState<'draft'|'finalizado'>('draft');
  const [selectedType, setSelectedType] = useState('');

  // Placeholder para mostrar el flujo según tipo seleccionado
  const renderTypeSection = () => {
    if (!selectedType) return null;
    if (selectedType === 'BA') {
      return (
        <div style={{margin:'1.5rem 0', padding:'1rem', background:'#f3f4f6', borderRadius:8}}>
          <strong>Flujo BA migrado:</strong> usar Payroll Runs
          <div style={{color:'#888', fontSize:'0.95rem', marginTop:8}}>
            El import legacy fue retirado. Continúa en /payroll/runs.
          </div>
        </div>
      );
    }
    return (
      <div style={{margin:'1.5rem 0', padding:'1rem', background:'#f3f4f6', borderRadius:8}}>
        <strong>Flujo para tipo:</strong> {selectedType}
        <div style={{color:'#888', fontSize:'0.95rem', marginTop:8}}>
          Aquí irá el formulario o carga de empleados para este tipo.
        </div>
      </div>
    );
  };

  // Placeholder para guardar draft
  const handleSaveDraft = () => {
    // Aquí se guardaría el payroll en estado draft
    alert('Payroll guardado como borrador (simulado)');
  };

  // Placeholder para aprobar
  const handleApprove = () => {
    setStatus('finalizado');
    alert('Payroll aprobado y cerrado (simulado)');
  };

  return (
    <div style={{padding:'2rem', background:'#fff', borderRadius:12, boxShadow:'0 2px 8px #0001', maxWidth:600, margin:'2rem auto'}}>
      <h2 style={{fontSize:'1.25rem', fontWeight:700, marginBottom:'1.5rem'}}>Nuevo Payroll</h2>
      {step === 1 && (
        <>
          <div style={{display:'flex', gap:'1.5rem', marginBottom:'1.5rem'}}>
            <div style={{flex:1}}>
              <label>Fecha de inicio del periodo</label>
              <input type="date" value={payStart} onChange={e=>setPayStart(e.target.value)} style={{width:'100%', padding:'0.5rem', borderRadius:8, border:'1.5px solid #cbd5e1', marginTop:4}} />
            </div>
            <div style={{flex:1}}>
              <label>Fecha de fin del periodo</label>
              <input type="date" value={payEnd} onChange={e=>setPayEnd(e.target.value)} style={{width:'100%', padding:'0.5rem', borderRadius:8, border:'1.5px solid #cbd5e1', marginTop:4}} />
            </div>
            <div style={{flex:1}}>
              <label>Día que corresponde el pago</label>
              <input type="date" value={payFor} onChange={e=>setPayFor(e.target.value)} style={{width:'100%', padding:'0.5rem', borderRadius:8, border:'1.5px solid #cbd5e1', marginTop:4}} />
            </div>
          </div>
          <div style={{display:'flex', gap:'1rem', marginTop:'2rem'}}>
            <button onClick={()=>setStep(2)} disabled={!payStart || !payEnd || !payFor} style={{background:'#2563eb', color:'#fff', border:'none', borderRadius:8, padding:'0.75rem 1.5rem', fontWeight:600, fontSize:'1rem', cursor:!payStart||!payEnd||!payFor?'not-allowed':'pointer', opacity:!payStart||!payEnd||!payFor?0.6:1}}>Siguiente</button>
            <button onClick={onClose} style={{background:'#6b7280', color:'#fff', border:'none', borderRadius:8, padding:'0.75rem 1.5rem', fontWeight:600, fontSize:'1rem', cursor:'pointer'}}>Cancelar</button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <label style={{fontWeight:600, marginBottom:8, display:'block'}}>Tipo de empleados</label>
          <div style={{display:'flex', gap:'1rem', flexWrap:'wrap', marginBottom:'1.5rem'}}>
            <button type="button" onClick={()=>setSelectedType('BA')} style={{padding:'0.75rem 1.5rem', borderRadius:8, border:'1px solid #2563eb', background:selectedType==='BA'?'#2563eb':'#fff', color:selectedType==='BA'?'#fff':'#2563eb', fontWeight:600, cursor:'pointer'}}>BA</button>
            <button type="button" onClick={()=>setSelectedType('CMHC')} style={{padding:'0.75rem 1.5rem', borderRadius:8, border:'1px solid #059669', background:selectedType==='CMHC'?'#059669':'#fff', color:selectedType==='CMHC'?'#fff':'#059669', fontWeight:600, cursor:'pointer'}}>CMHC</button>
            <button type="button" onClick={()=>setSelectedType('TCM')} style={{padding:'0.75rem 1.5rem', borderRadius:8, border:'1px solid #f59e42', background:selectedType==='TCM'?'#f59e42':'#fff', color:selectedType==='TCM'?'#fff':'#f59e42', fontWeight:600, cursor:'pointer'}}>TCM</button>
            <button type="button" onClick={()=>setSelectedType('Admin')} style={{padding:'0.75rem 1.5rem', borderRadius:8, border:'1px solid #6b7280', background:selectedType==='Admin'?'#6b7280':'#fff', color:selectedType==='Admin'?'#fff':'#6b7280', fontWeight:600, cursor:'pointer'}}>Admin</button>
          </div>
          {renderTypeSection()}
          <div style={{display:'flex', gap:'1rem', marginTop:'2rem'}}>
            <button onClick={()=>setStep(1)} style={{background:'#6b7280', color:'#fff', border:'none', borderRadius:8, padding:'0.75rem 1.5rem', fontWeight:600, fontSize:'1rem', cursor:'pointer'}}>Regresar</button>
            <button onClick={handleSaveDraft} style={{background:'#f59e42', color:'#fff', border:'none', borderRadius:8, padding:'0.75rem 1.5rem', fontWeight:600, fontSize:'1rem', cursor:'pointer'}}>Guardar como borrador</button>
            <button onClick={handleApprove} disabled={status==='finalizado'} style={{background:'#059669', color:'#fff', border:'none', borderRadius:8, padding:'0.75rem 1.5rem', fontWeight:600, fontSize:'1rem', cursor:'pointer', opacity:status==='finalizado'?0.7:1}}>Aprobar y cerrar</button>
          </div>
          {status==='finalizado' && <div style={{color:'#059669', fontWeight:600, marginTop:16}}>Payroll cerrado, ya no se puede modificar.</div>}
        </>
      )}
    </div>
  );
}
