// import { SessionProvider } from "next-auth/react"; // Eliminado: migración a Supabase Auth

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
