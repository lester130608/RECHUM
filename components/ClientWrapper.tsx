"use client";

// import { SessionProvider } from "next-auth/react"; // Eliminado: migración a Supabase Auth

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}