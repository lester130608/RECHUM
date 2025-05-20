import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import sql from 'mssql'

const supabase = getSupabaseAdmin()

// SQL Server config desde variables de entorno
const sqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
}

export async function GET() {
  try {
    await sql.connect(sqlConfig)

    const query = `
      SELECT 
        U.UserID,
        CONCAT(U.FirstName, ' ', U.LastName) AS FullName,
        T.Week,
        T.Year,
        T.TotalUnits,
        T.CreatedOn
      FROM UserRole UR
      JOIN [User] U ON UR.UserID = U.UserID
      JOIN TimeSheet T ON UR.UserID = T.UserID
      WHERE UR.RoleID = 1023 AND T.Status = 1
    `

    const result = await sql.query(query)
    const rows = result.recordset
    let insertedCount = 0
    let skippedCount = 0

    for (const row of rows) {
      const sourceKey = `${row.UserID}-W${row.Week}`

      const { data: existing } = await supabase
        .from('payroll_tcm_raw')
        .select('id')
        .eq('source_key', sourceKey)
        .maybeSingle()

      if (existing) {
        skippedCount++
        continue
      }

      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .ilike('full_name', `${row.FullName}`)
        .maybeSingle()

      if (!employee) continue

      const rate = row.TotalUnits >= 36 ? 30 : 28
      const total = row.TotalUnits * rate

      const insert = await supabase.from('payroll_tcm_raw').insert({
        employee_id: employee.id,
        name: row.FullName,
        week: `W${row.Week}`,
        year: row.Year,
        total_units: row.TotalUnits,
        created_on: row.CreatedOn,
        source_key: sourceKey,
        payment_status: 'pending',
        rate,
        total,
      })

      if (!insert.error) insertedCount++
    }

    return NextResponse.json({
      message: `✅ ${insertedCount} insertados, ${skippedCount} ya existentes.`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}