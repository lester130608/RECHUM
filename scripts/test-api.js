// scripts/test-api.js
// Script para probar APIs del sistema Payroll V2
// Ejecutar con: node scripts/test-api.js
// Date: March 2, 2026

const API_BASE = 'http://localhost:3000/api';

// Helper para hacer requests
async function apiCall(method, endpoint, data = null, headers = {}) {
  const url = `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  console.log(`\n🔄 ${method} ${url}`);
  if (data) console.log('📤 Payload:', JSON.stringify(data, null, 2));
  
  try {
    const response = await fetch(url, options);
    const result = await response.text();
    
    let parsedResult;
    try {
      parsedResult = JSON.parse(result);
    } catch {
      parsedResult = result;
    }
    
    console.log(`📊 Status: ${response.status}`);
    console.log('📥 Response:', JSON.stringify(parsedResult, null, 2));
    
    return { status: response.status, data: parsedResult, ok: response.ok };
  } catch (error) {
    console.log('❌ Error:', error.message);
    return { error: error.message, ok: false };
  }
}

async function testPayrollSystem() {
  console.log('🚀 Testing Payroll V2 API System');
  console.log('===============================================');
  
  let payRunId;
  
  // 1. Test crear pay run
  console.log('\n1️⃣ TESTING: Create Pay Run');
  const createResponse = await apiCall('POST', '/payroll/runs', {
    week_ending: '2026-03-07',
    notes: 'API Test Pay Run'
  });
  
  if (createResponse.ok) {
    payRunId = createResponse.data.pay_run.id;
    console.log('✅ Pay Run Created:', payRunId);
  } else {
    console.log('❌ Failed to create pay run');
    return;
  }
  
  // 2. Test listar pay runs
  console.log('\n2️⃣ TESTING: List Pay Runs');
  await apiCall('GET', '/payroll/runs');
  
  // 3. Test obtener detalles del pay run
  console.log('\n3️⃣ TESTING: Get Pay Run Details');
  await apiCall('GET', `/payroll/runs/${payRunId}`);
  
  // 4. Test enviar inputs
  console.log('\n4️⃣ TESTING: Submit Payroll Inputs');
  const inputPayload = {
    department: 'BA',
    payload: [
      {
        worker_name: 'John Doe',
        service_code: 'REG',
        hours: 40,
        memo: 'API Test - Regular hours'
      },
      {
        worker_name: 'John Doe', 
        service_code: 'OT',
        hours: 5,
        memo: 'API Test - Overtime'
      },
      {
        worker_name: 'Jane Smith',
        service_code: 'REG', 
        hours: 35,
        memo: 'API Test - Regular hours'
      }
    ]
  };
  
  await apiCall('POST', `/payroll/runs/${payRunId}/inputs`, inputPayload);
  
  // 5. Test listar inputs
  console.log('\n5️⃣ TESTING: List Inputs');
  await apiCall('GET', `/payroll/runs/${payRunId}/inputs`);
  
  // 6. Test cálculo
  console.log('\n6️⃣ TESTING: Calculate Payroll');
  await apiCall('POST', `/payroll/runs/${payRunId}/calculate`);
  
  // 7. Test detalles después del cálculo
  console.log('\n7️⃣ TESTING: Pay Run Details After Calculation');
  await apiCall('GET', `/payroll/runs/${payRunId}`);
  
  // 8. Test preview export
  console.log('\n8️⃣ TESTING: Preview Export');
  await apiCall('POST', `/payroll/runs/${payRunId}/export`);
  
  console.log('\n===============================================');
  console.log('✅ API Testing Complete!');
  console.log(`📝 Pay Run ID for manual testing: ${payRunId}`);
}

// Ejecutar las pruebas
testPayrollSystem().catch(console.error);