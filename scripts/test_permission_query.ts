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
  const LESTER_AUTH_UUID = "ffc5af00-cd84-49bb-b5d5-724baa67dc2a";

  console.log("=== Test query del helper requirePermission ===\n");
  console.log("Query exacto que usa el helper:\n");

  const { data, error } = await supabase
    .from('employees')
    .select(`
      id,
      user_roles (
        role_permissions (
          permissions (
            code
          )
        )
      )
    `)
    .eq('user_id', LESTER_AUTH_UUID)
    .maybeSingle();

  if (error) {
    console.log("ERROR:");
    console.log(JSON.stringify(error, null, 2));
    return;
  }

  console.log("Resultado del query:");
  console.log(JSON.stringify(data, null, 2));

  if (!data) {
    console.log("\nPROBLEMA: data es null");
    return;
  }

  console.log("\n=== Análisis ===");
  console.log("- employee.id:", (data as any).id);
  console.log("- user_roles existe?:", !!(data as any).user_roles);
  console.log(
    "- user_roles tipo:",
    Array.isArray((data as any).user_roles) ? "array" : typeof (data as any).user_roles
  );
  console.log(
    "- user_roles length:",
    Array.isArray((data as any).user_roles) ? (data as any).user_roles.length : "N/A"
  );
}

main().catch(console.error);
