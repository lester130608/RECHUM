'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function SystemAccessRequestForm({ employeeId }: Props) {
  const [role, setRole] = useState('')
  const [action, setAction] = useState('')
  const [supervisorApproval, setSupervisorApproval] = useState('')
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('system_access_requests')
        .select('*')
        .eq('employee_id', employeeId)
        .single()

      if (data) {
        setRole(data.role || '')
        setAction(data.action || '')
        setSupervisorApproval(data.supervisor_approval || '')
        if (data.role && data.action) setLocked(true)
      }

      setLoading(false)
    }

    fetch()
  }, [employeeId])

  const handleSave = async () => {
    const { error } = await supabase
      .from('system_access_requests')
      .upsert(
        {
          employee_id: employeeId,
          role,
          action,
          supervisor_approval: supervisorApproval,
        },
        { onConflict: ['employee_id'] }
      )

    if (error) {
      alert('Error saving request: ' + error.message)
    } else {
      alert('Access request submitted ✅')
      setLocked(true)
    }
  }

  if (loading) return <p className="p-4">Loading request...</p>

  return (
    <div className="section">
      <h2 className="heading">🖥️ System Access Request</h2>

      <div className="form-row">
        <label>Requested Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={locked}
        >
          <option value="">Select</option>
          <option value="Supervisor">Supervisor</option>
          <option value="Clinician">Clinician</option>
          <option value="Biller">Biller</option>
          <option value="TCM">TCM</option>
          <option value="RBT">RBT</option>
          <option value="Admin">Admin</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div className="form-row">
        <label>Requested Action</label>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          disabled={locked}
        >
          <option value="">Select</option>
          <option value="Add">Add</option>
          <option value="Deactivate">Deactivate</option>
          <option value="Reactivate">Reactivate</option>
          <option value="Update">Update</option>
        </select>
      </div>

      <div className="form-row">
        <label>Supervisor Signature (optional)</label>
        <input
          type="text"
          value={supervisorApproval}
          onChange={(e) => setSupervisorApproval(e.target.value)}
          disabled={locked}
          placeholder="HR will complete this later"
        />
      </div>

      {!locked && (
        <button
          onClick={handleSave}
          className="primary"
          style={{ marginTop: '1rem' }}
        >
          Submit Request
        </button>
      )}

      {locked && (
        <p style={{ marginTop: '1rem', color: '#15803d', fontWeight: 500 }}>
          ✅ Request submitted
        </p>
      )}
    </div>
  )
}