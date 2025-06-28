'use client'
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Contraseña cambiada. Ahora puedes iniciar sesión.");
      setTimeout(() => router.push("/login"), 2000);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "4rem auto", padding: 24, background: "#fff", borderRadius: 8 }}>
      <h2>Restablecer contraseña</h2>
      <form onSubmit={handleReset}>
        <input
          type="password"
          placeholder="Nueva contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8, margin: "16px 0" }}
        />
        <button type="submit" style={{ width: "100%", padding: 10, background: "#1e40af", color: "#fff" }}>
          Cambiar contraseña
        </button>
      </form>
      {message && <div style={{ marginTop: 16 }}>{message}</div>}
    </div>
  );
}