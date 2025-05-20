// lib/employeeService.ts
import { supabase } from "./supabaseClient";

export const getAllEmployees = async () => {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("status", "active");

  if (error) {
    throw error;
  }
  return data;
};