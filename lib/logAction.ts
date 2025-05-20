import { supabase } from '@/lib/supabase'

export async function logAction({
  employeeId,
  action,
  by
}: {
  employeeId: string
  action: string
  by: string
}) {
  const { error } = await supabase.from('employee_logs').insert({
    employee_id: employeeId,
    action,
    by
  })

  if (error) {
    console.error('Error logging action:', error.message)
  }
}