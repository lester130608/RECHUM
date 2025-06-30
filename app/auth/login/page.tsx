"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import "./style.css";

export default function LoginPage() {
  console.log("LoginPage rendered");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      console.log("Login response:", { error, data });
      if (error) {
        setError("Supabase: " + error.message);
        alert("Supabase: " + error.message);
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setError("Ocurrió un error inesperado: " + (err && err.message ? err.message : String(err)));
      console.error("Error inesperado en login:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    alert("Forgot password clicked");
    console.log("typeof supabase.auth.resetPasswordForEmail:", typeof supabase.auth.resetPasswordForEmail);
    if (!supabase.auth.resetPasswordForEmail) {
      setError("El método resetPasswordForEmail no está disponible en el cliente Supabase. Reinstala la librería.");
      return;
    }
    setError("");
    setResetMessage("");
    if (!email) {
      setError("Por favor ingresa tu email primero.");
      return;
    }
    setForgotLoading(true);
    try {
      console.log("Enviando solicitud de reset para:", email);
      const { error, data } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://www.dttcoaching-payroll.com/auth/reset-password",
      });
      console.log("Reset password response:", { error, data });
      if (error) {
        setError("Error al enviar el email de recuperación: " + error.message);
        console.error("Supabase reset error:", error);
      } else {
        setResetMessage("Revisa tu correo para el enlace de recuperación.");
        console.log("Reset email enviado correctamente");
      }
    } catch (err: any) {
      setError("Ocurrió un error inesperado: " + (err && err.message ? err.message : String(err)));
      console.error("Error inesperado en reset:", err);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="login-title">Welcome to DTT Coaching</h2>
        {error && <p className="error-message">{error}</p>}
        {resetMessage && <p className="success-message">{resetMessage}</p>}
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="login-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="login-input"
          />
          <button type="submit" className="login-button">
            Sign In
          </button>
        </form>
        {/* Mueve el botón fuera del form para evitar submit accidental */}
        <button
          type="button"
          className="forgot-password-link"
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            color: "#1e40af",
            cursor: forgotLoading ? "not-allowed" : "pointer",
            textDecoration: "underline",
            opacity: forgotLoading ? 0.6 : 1,
          }}
          onClick={handleForgotPassword}
          disabled={forgotLoading}
        >
          {forgotLoading ? "Enviando..." : "¿Olvidaste tu contraseña?"}
        </button>
      </div>
    </div>
  );
}