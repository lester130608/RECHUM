// Archivo: app/api/payroll/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// (Opcional) Importa funciones para guardar en la base de datos
// import { createPayroll } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const payrollData = await request.json();

    // Aquí realizarías la validación y guardarías los datos en tu base de datos.
    // Ejemplo con Supabase o cualquier otro ORM:
    // const { error } = await createPayroll(payrollData);
    // if (error) throw new Error(error.message);

    // Simulamos una respuesta exitosa
    return NextResponse.json({ message: "Nómina creada exitosamente" }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}