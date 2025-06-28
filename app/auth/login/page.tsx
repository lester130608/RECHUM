"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import "./style.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError("Invalid email or password");
    } else {
      window.location.href = "/dashboard";
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setResetMessage("");
    if (!email) {
      setError("Please enter your email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://www.dttcoaching-payroll.com/auth/reset-password",
    });
    if (error) {
      setError("Error sending reset email: " + error.message);
    } else {
      setResetMessage("Check your email for a password reset link.");
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
        <button
          type="button"
          className="forgot-password-link"
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            color: "#1e40af",
            cursor: "pointer",
            textDecoration: "underline",
          }}
          onClick={handleForgotPassword}
        >
          Forgot password?
        </button>
      </div>
    </div>
  );
}