"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  user_id: string;
};

type UserState = {
  employee: Employee | null;
  permissions: string[];
  roles: string[];
  loading: boolean;
  hasPermission: (code: string) => boolean;
  hasRole: (code: string) => boolean;
};

export function useUser(): UserState {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // 1) Usuario autenticado
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setEmployee(null);
            setPermissions([]);
            setRoles([]);
            setLoading(false);
          }
          return;
        }

        // 2) Empleado vinculado
        const { data: emp } = await supabase
          .from("employees")
          .select("id, first_name, last_name, full_name, email, user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!emp) {
          if (!cancelled) {
            setEmployee(null);
            setPermissions([]);
            setRoles([]);
            setLoading(false);
          }
          return;
        }

        // 3) Roles activos del empleado
        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("role_id")
          .eq("employee_id", emp.id)
          .eq("active", true);

        if (!userRoles || userRoles.length === 0) {
          if (!cancelled) {
            setEmployee(emp as Employee);
            setPermissions([]);
            setRoles([]);
            setLoading(false);
          }
          return;
        }

        const roleIds = userRoles.map((r: any) => r.role_id);

        // 4) Nombres/códigos de roles
        const { data: roleRows } = await supabase
          .from("roles")
          .select("id, name, code")
          .in("id", roleIds);

        const roleCodes = (roleRows ?? []).map((r: any) => r.code || r.name);

        // 5) Permission IDs de esos roles
        const { data: rolePerms } = await supabase
          .from("role_permissions")
          .select("permission_id")
          .in("role_id", roleIds);

        if (!rolePerms || rolePerms.length === 0) {
          if (!cancelled) {
            setEmployee(emp as Employee);
            setPermissions([]);
            setRoles(roleCodes);
            setLoading(false);
          }
          return;
        }

        const permIds = rolePerms.map((rp: any) => rp.permission_id);

        // 6) Códigos de permisos
        const { data: permRows } = await supabase
          .from("permissions")
          .select("code")
          .in("id", permIds);

        const permCodes = (permRows ?? []).map((p: any) => p.code);

        if (!cancelled) {
          setEmployee(emp as Employee);
          setPermissions(permCodes);
          setRoles(roleCodes);
          setLoading(false);
        }
      } catch (err) {
        console.error("[useUser] error:", err);
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    employee,
    permissions,
    roles,
    loading,
    hasPermission: (code: string) => permissions.includes(code),
    hasRole: (code: string) => roles.includes(code),
  };
}
