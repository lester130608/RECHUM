import "../styles/globals.css";
import SessionWrapper from "@/components/SessionWrapper"; // asegúrate que la ruta es correcta
import "../styles/app.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionWrapper>{children}</SessionWrapper>
      </body>
    </html>
  );
}