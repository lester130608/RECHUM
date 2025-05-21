import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const role = searchParams.get("role")

  if (!role) return NextResponse.json([], { status: 200 })

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from("role_service_codes")
    .select("service_code")
    .eq("role", role)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data.map((item) => item.service_code))
}