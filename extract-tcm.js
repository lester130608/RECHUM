
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const sql = require('mssql');

const sqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function extractTCMPayroll() {
  try {
    await sql.connect(sqlConfig);

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
    `;

    const result = await sql.query(query);
    const rows = result.recordset;

    for (const row of rows) {
      const sourceKey = `${row.UserID}-W${row.Week}`;

      const { data: existing } = await supabase
        .from('payroll_tcm_raw')
        .select('id')
        .eq('source_key', sourceKey)
        .maybeSingle();

      if (existing) {
        console.log(`Ya existe: ${sourceKey}, saltando...`);
        continue;
      }

      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .ilike('full_name', `${row.FullName}`)
        .maybeSingle();

      if (!employee) {
        console.warn(`Empleado no encontrado: ${row.FullName}`);
        continue;
      }

      const rate = row.TotalUnits >= 36 ? 30 : 28;
      const total = row.TotalUnits * rate;

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
      });

      if (insert.error) {
        console.error(`Error insertando: ${insert.error.message}`);
      } else {
        console.log(`✔ Insertado: ${row.FullName} - ${sourceKey}`);
      }
    }

    await sql.close();
    console.log('✅ Extracción de TCM completada.');
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

extractTCMPayroll();
