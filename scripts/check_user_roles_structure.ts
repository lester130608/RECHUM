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
  const LESTER_EMP_ID = "062a1148-25b4-404a-bacd-e0f65e5ad5c1";
  
  console.log("=== Estructura de user_roles ===\n");

  // Obtener una fila para ver columnas reales
  const { data: sample, error } = await supabase
    .from("user_roles")
    .select("*")
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.log("Error:", error.message);
    return;
  }

  if (sample) {
    console.log("Columnas existentes:");
    Object.keys(sample).forEach(k => {
      console.log(`  - ${k}: ${typeof sample[k]} (valor: ${JSON.stringify(sample[k])})`);
    });
  } else {
    console.log("Tabla vacía");
  }

  // Buscar roles de Lester
  console.log("\n=== Roles de Lester (employee_id = " + LESTER_EMP_ID + ") ===");
  const { data: myRoles } = await supabase
    .from("user_roles")
    .select("*")
    .eq("employee_id", LESTER_EMP_ID);
  
  if (myRoles && myRoles.length > 0) {
    myRoles.forEach((r: any) => {
      console.log(JSON.stringify(r, null, 2));
    });

    // Obtener detalles del rol
    const roleIds = myRoles.map((r: any) => r.role_id);
    const { data: roles } = await supabase
      .from("roles")
      .select("*")
      .in("id", roleIds);
    
    console.log("\n=== Detalles de los roles ===");
    roles?.forEach((r: any) => {
      console.log(JSON.stringify(r, null, 2));
    });

    // Permisos
    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", roleIds);
    
    if (rolePerms && rolePerms.length > 0) {
      const permIds = rolePerms.map((rp: any) => rp.permission_id);
      const { data: perms } = await supabase
        .from("permissions")
        .select("code, description")
        .in("id", permIds);
      
      console.log("\n=== Permisos del usuario ===");
      perms?.forEach((p: any) => {
        console.log(`  - ${p.code}`);
      });

      const hasManageEmp = perms?.some((p: any) => p.code === "manage_employees");
      console.log(`\n¿Tiene manage_employees?: ${hasManageEmp ? "SI" : "NO"}`);
    } else {
      console.log("Sin permisos asignados");
    }
  } else {
    console.log("Sin roles asignados");
  }
}

main().catch(console.error);
