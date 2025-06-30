export default function Providers({ children }: { children: React.ReactNode }) {
  // Eliminado SessionProvider: ahora solo se usa Supabase Auth
  return <>{children}</>;
}
