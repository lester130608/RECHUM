'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSupabaseUser } from '@/hooks/useSupabaseUser'

interface Props {
  employeeId: string
}

export default function ApplicationPersonalSection({ employeeId }: Props) {
  const user = useSupabaseUser();
  const [form, setForm] = useState({
    full_name: '',
    address: '',
    phone: '',
    has_license: false,
    felony: '',
    desired_position: '',
    availability: '',
    start_date: '',
    special_skills: '',
  })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('employment_applications')
        .select('*')
        .eq('employee_id', employeeId)
        .single()

      if (data) setForm(data)
      setLoading(false)
    }

    fetchData()
  }, [employeeId, user])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async () => {
    const { error } = await supabase.from('employment_applications').upsert({
      ...form,
      employee_id: employeeId,
    }, { onConflict: ['employee_id'] })

    if (error) {
      alert('Error saving form: ' + error.message)
    } else {
      alert('Personal information saved ✅')
    }
  }

  if (loading) return <p className="p-4">Loading form...</p>

  return (
    <div className="section">
      <h2 className="heading">📝 Personal Information and Job Preference</h2>

      <div className="form-row">
        <label htmlFor="full_name">Full Name</label>
        <input
          type="text"
          name="full_name"
          value={form.full_name}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="address">Address</label>
        <input
          type="text"
          name="address"
          value={form.address}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="phone">Phone</label>
        <input
          type="text"
          name="phone"
          value={form.phone}
          onChange={handleChange}
        />
      </div>

      <div className="form-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          name="has_license"
          checked={form.has_license}
          onChange={handleChange}
        />
        <label htmlFor="has_license">I have a valid driver's license</label>
      </div>

      <div className="form-row">
        <label htmlFor="felony">Have you been convicted of a felony?</label>
        <select
          name="felony"
          value={form.felony}
          onChange={handleChange}
        >
          <option value="">Select</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="desired_position">Desired Position</label>
        <input
          type="text"
          name="desired_position"
          value={form.desired_position}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="availability">Preferred Schedule</label>
        <select
          name="availability"
          value={form.availability}
          onChange={handleChange}
        >
          <option value="">Select</option>
          <option value="full_time">Full Time</option>
          <option value="part_time">Part Time</option>
          <option value="per_diem">Per Diem</option>
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="start_date">Available Start Date</label>
        <input
          type="date"
          name="start_date"
          value={form.start_date}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="special_skills">Special Skills</label>
        <textarea
          name="special_skills"
          value={form.special_skills}
          onChange={handleChange}
        />
      </div>

      <button
        onClick={handleSubmit}
        className="primary"
        style={{ marginTop: "1rem" }}
      >
        Save Section
      </button>
    </div>
  )
}