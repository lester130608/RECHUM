// lib/supabase.ts
//
// DEPRECADO. Este módulo solo re-exporta el cliente de navegador de
// '@/lib/supabaseClient' para no romper los ~20 imports heredados del módulo HR.
//
// No añadas imports nuevos de este archivo. En código nuevo usa:
//   - Cliente:  import { supabase } from '@/lib/supabaseClient'
//   - Servidor: import { createServerSupabase } from '@/lib/supabase/server'
//
// Antes este archivo estaba enteramente comentado, lo que lo convertía en un
// módulo sin exports y rompía el typecheck en cada archivo que lo importaba.

export { supabase } from '@/lib/supabaseClient';
