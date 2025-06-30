import { supabase } from "@/lib/supabase";

export async function checkUserRole(requiredRole: string) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('email', user.email)
    .single();

  if (!userRow || userRow.role !== requiredRole) {
    return false;
  }

  return true;
}