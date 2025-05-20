'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function ApplicationEducationSection({ employeeId }: Props) {
  const [form, setForm] = useState({
    high_school: '',
    hs_city: '',
    hs_grad_year: '',

    college: '',
    college_city: '',
    college_degree: '',
    college_grad_year: '',

    other_training: '',
    other_training_type: '',
    other_training_year: '',

    job1_employer: '',
    job1_position: '',
    job1_start: '',
    job1_end: '',
    job1_reason: '',

    job2_employer: '',
    job2_position: '',
    job2_start: '',
    job2_end: '',
    job2_reason: '',

    job3_employer: '',
    job3_position: '',
    job3_start: '',
    job3_end: '',
    job3_reason: '',
  })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from('employment_applications')
        .select('*')
        .eq('employee_id', employeeId)
        .single()

      if (data) setForm((prev) => ({ ...prev, ...data }))
      setLoading(false)
    }

    fetchData()
  }, [employeeId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    const { error } = await supabase
      .from('employment_applications')
      .upsert({ ...form, employee_id: employeeId }, { onConflict: ['employee_id'] })

    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      alert('Education and experience saved ✅')
    }
  }

  if (loading) return <p className="p-4">Loading...</p>

  return (
    <div className="section">
      <h2 className="heading">🎓 Education & 💼 Work Experience</h2>

      {/* Education */}
      <div className="form-row">
        <label>High School</label>
        <input name="high_school" value={form.high_school} onChange={handleChange} placeholder="School name" />
        <input name="hs_city" value={form.hs_city} onChange={handleChange} placeholder="City" />
        <input name="hs_grad_year" value={form.hs_grad_year} onChange={handleChange} placeholder="Graduation year" />
      </div>

      <div className="form-row">
        <label>College</label>
        <input name="college" value={form.college} onChange={handleChange} placeholder="College name" />
        <input name="college_city" value={form.college_city} onChange={handleChange} placeholder="City" />
        <input name="college_degree" value={form.college_degree} onChange={handleChange} placeholder="Degree earned" />
        <input name="college_grad_year" value={form.college_grad_year} onChange={handleChange} placeholder="Graduation year" />
      </div>

      <div className="form-row">
        <label>Other Training</label>
        <input name="other_training" value={form.other_training} onChange={handleChange} placeholder="Institution or center" />
        <input name="other_training_type" value={form.other_training_type} onChange={handleChange} placeholder="Type or specialty" />
        <input name="other_training_year" value={form.other_training_year} onChange={handleChange} placeholder="Year" />
      </div>

      {/* Work Experience */}
      {[1, 2, 3].map((i) => (
        <div className="form-row" key={i}>
          <label>Job #{i}</label>
          <input name={`job${i}_employer`} value={form[`job${i}_employer` as keyof typeof form]} onChange={handleChange} placeholder="Employer name" />
          <input name={`job${i}_position`} value={form[`job${i}_position` as keyof typeof form]} onChange={handleChange} placeholder="Position" />
          <input name={`job${i}_start`} value={form[`job${i}_start` as keyof typeof form]} onChange={handleChange} placeholder="Start date" />
          <input name={`job${i}_end`} value={form[`job${i}_end` as keyof typeof form]} onChange={handleChange} placeholder="End date" />
          <textarea name={`job${i}_reason`} value={form[`job${i}_reason` as keyof typeof form]} onChange={handleChange} placeholder="Reason for leaving" />
        </div>
      ))}

      <button
        onClick={handleSave}
        className="primary"
        style={{ marginTop: "1rem" }}
      >
        Save Section
      </button>
    </div>
  )
}