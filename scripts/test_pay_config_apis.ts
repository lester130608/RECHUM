import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, KEY);

async function main() {
  console.log("=== Test directo de tablas pay_role_configs + pay_role_rates ===\n");

  // Buscar un empleado de prueba
  const { data: emp } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("first_name", "Damarys")
    .limit(1)
    .maybeSingle();

  if (!emp) {
    console.log("No se encontró Damarys. Saliendo.");
    return;
  }

  console.log(`Empleado de prueba: ${emp.first_name} ${emp.last_name}`);
  console.log(`ID: ${emp.id}\n`);

  // 1) Crear config EMPLOYEE
  console.log("1) Crear config EMPLOYEE para Damarys:");
  const { data: config, error: e1 } = await supabase
    .from("pay_role_configs")
    .insert({
      employee_id: emp.id,
      role: "EMPLOYEE",
      tax_type: "W2",
      notes: "TEST - script verification",
    })
    .select()
    .single();

  if (e1) {
    console.log("   ❌", e1.message);
    return;
  }
  console.log(`   ✓ Config creada: ${config.id}`);
  console.log(`   role=${config.role}, tax=${config.tax_type}, active=${config.active}`);
  console.log(`   valid_from=${config.valid_from}, valid_to=${config.valid_to}\n`);

  // 2) Insertar rate
  console.log("2) Insertar rate HOURLY $42:");
  const { data: rate, error: e2 } = await supabase
    .from("pay_role_rates")
    .insert({
      pay_role_config_id: config.id,
      rate_key: "HOURLY",
      rate_value: 42,
    })
    .select()
    .single();

  if (e2) {
    console.log("   ❌", e2.message);
  } else {
    console.log(`   ✓ Rate creado: ${rate.rate_key} = $${rate.rate_value}\n`);
  }

  // 3) Leer config con rates
  console.log("3) Leer config con rates joined:");
  const { data: full } = await supabase
    .from("pay_role_configs")
    .select("*, rates:pay_role_rates(*)")
    .eq("id", config.id)
    .single();

  console.log(`   Config: ${full?.role} (${full?.tax_type})`);
  console.log(`   Rates: ${full?.rates?.length} fila(s)`);
  full?.rates?.forEach((r: any) => {
    console.log(`     - ${r.rate_key} = $${r.rate_value}`);
  });

  // 4) Cleanup
  console.log("\n4) Limpieza:");
  await supabase.from("pay_role_configs").delete().eq("id", config.id);
  console.log("   ✓ Config y rates eliminados (cascade)");

  console.log("\n=== Test OK ===");
}

main().catch(console.error);
