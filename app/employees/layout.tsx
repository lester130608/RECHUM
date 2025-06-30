'use client'

import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import BackButton from "@/components/BackButton";

export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
    };
    getUser();
  }, []);

  // Evita mostrar contenido hasta que haya sesión
  if (!email) return null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "2rem auto",
        padding: "2rem",
        fontFamily: "Segoe UI, sans-serif",
      }}
    >
      <BackButton />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: "bold" }}>
          Welcome, {email}
        </h1>
        <button
          onClick={handleSignOut}
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