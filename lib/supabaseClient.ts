"use client"; 

import { createClient } from "@supabase/supabase-js";

// Variables de entorno (asegúrate de definirlas en tu .env.local)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 🔍 Imprime los valores para verificar si están definidos
console.log("🔍 Supabase URL:", supabaseUrl);
console.log("🔍 Supabase Key:", supabaseAnonKey ? "✅ Clave detectada" : "❌ Clave no encontrada");

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "❌ No se han definido las variables NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

/**
 * Cliente de Supabase
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);