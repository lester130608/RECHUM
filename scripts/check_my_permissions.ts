import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SECRET_KEY ?? 
            process.env.SUPABASE_SERVICE_ROLE_KEY ?? 
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, KEY);

async function main() {
  const LESTER_AUTH_UUID = "ffc5af00-cd84-49bb-b5d5-724baa67dc2a";
  
  console.log("=== Diagnóstico de permisos para Lester ===\n");
  console.log(`Auth UUID esperado: ${LESTER_AUTH_UUID}\n`);

  // 1) Verificar que existe en auth.users (a través de employee con user_id)
  console.log("1) Buscar empleado con user_id = Lester Auth UUID:");
  const { data: emp, error: e1 } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, user_id")
    .eq("user_id", LESTER_AUTH_UUID)
    .maybeSingle();
  
  if (e1) {
    console.log("   ERROR:", e1.message);
  } else if (!emp) {
    console.log("   PROBLEMA: No hay empleado con ese user_id");
  } else {
    console.log(`   OK: ${emp.first_name} ${emp.last_name} (employee.id = ${emp.id})`);
  }

  if (!emp) return;

  // 2) Verificar user_roles asignados al empleado
  console.log("\n2) Roles asignados al empleado:");
  const { data: userRoles, error: e2 } = await supabase
    .from("user_roles")
    .select("id, role_id, active, valid_from, valid_to")
    .eq("employee_id", emp.id);
  
  if (e2) {
    console.log("   ERROR:", e2.message);
  } else if (!userRoles || userRoles.length === 0) {
    console.log("   PROBLEMA: No tiene roles asignados");
  } else {
    console.log(`   Roles encontrados: ${userRoles.length}`);
    userRoles.forEach((ur: any) => {
      console.log(`   - role_id=${ur.role_id}, active=${ur.active}, from=${ur.valid_from}, to=${ur.valid_to}`);
    });
  }

  if (!userRoles || userRoles.length === 0) return;

  // 3) Nombres de roles
  console.log("\n3) Detalles de cada rol:");
  const roleIds = userRoles.map((ur: any) => ur.role_id);
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, description")
    .in("id", roleIds);
  
  roles?.forEach((r: any) => {
    console.log(`   - ${r.name}: ${r.description ?? ""}`);
  });

  // 4) Permisos de esos roles
  console.log("\n4) Permisos asignados a estos roles:");
  const { data: rolePerms } = await supabase
    .from("role_permissions")
    .select("role_id, permission_id")
    .in("role_id", roleIds);
  
  if (rolePerms && rolePerms.length > 0) {
    const permIds = rolePerms.map((rp: any) => rp.permission_id);
    const { data: perms } = await supabase
      .from("permissions")
      .select("id, code, description")
      .in("id", permIds);
    
    console.log(`   Permisos totales: ${perms?.length ?? 0}`);
    perms?.forEach((p: any) => {
      console.log(`   - ${p.code}: ${p.description ?? ""}`);
    });

    // Verificar específicamente manage_employees
    console.log("\n5) ¿Tiene manage_employees?");
    const hasIt = perms?.some((p: any) => p.code === "manage_employees");
    console.log(`   ${hasIt ? "SI - debería funcionar" : "NO - este es el problema"}`);
  }

  console.log("\n=== Fin del diagnóstico ===");
}

main().catch(console.error);
