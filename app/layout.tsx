import "../styles/globals.css";
import "../styles/app.css";
import { supabase } from '@/lib/supabase';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}