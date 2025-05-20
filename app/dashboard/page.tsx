import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import DashboardExpirations from '@/components/DashboardExpirations'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  console.log("DASHBOARD SESSION:", session); // 👈 Esto imprime la sesión en el servidor

  if (!session || session.user.role !== "admin") {
    redirect("/not-authorized");
  }

  return (
    <>
      <div style={{ padding: "2rem", fontFamily: "Segoe UI, sans-serif" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
          Welcome to the Admin Dashboard
        </h1>
        <p style={{ marginTop: "1rem", color: "#4b5563" }}>
          From here you can manage employees, reports, and system settings.
        </p>
      </div>
  
      <div style={{ marginTop: "2rem" }}>
        <DashboardExpirations />
      </div>
    </>
  )
}
