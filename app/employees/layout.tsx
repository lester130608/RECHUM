'use client'

import { useSession, signOut } from "next-auth/react";

export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  // Evita mostrar contenido hasta que haya sesión
  if (!session) return null;

  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "2rem auto",
        padding: "2rem",
        fontFamily: "Segoe UI, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: "bold" }}>
          Welcome, {session.user.email}
        </h1>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#ef4444",
            color: "white",
            fontWeight: 600,
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      <div>{children}</div>
    </div>
  );
}