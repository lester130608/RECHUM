"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (result?.error) {
      alert("Login failed. Please check your credentials.");
      setLoading(false);
      return;
    }

    await new Promise((res) => setTimeout(res, 300));

    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();
    console.log("LOGIN SESSION:", session);
    alert("LOGIN SESSION:\n" + JSON.stringify(session, null, 2)); // 👀 visible al usuario

    const role = session?.user?.role;

    if (role === "admin") {
      window.location.href = "/dashboard";
    } else if (role === "employee") {
      window.location.href = "/employees/my";
    } else {
      alert("Unknown role. Please contact the administrator.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#f3f4f6",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "2rem",
          borderRadius: "0.5rem",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          width: "100%",
          maxWidth: "24rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <img
            src="/logo.png"
            alt="DTT Coaching Services, LLC"
            style={{
              maxHeight: "100px",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              marginBottom: "1rem",
            }}
          />
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            DTT Coaching Services, LLC{" "}
            <span style={{ color: "#ef4444" }}>Payroll</span>
          </h1>
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: "500",
              color: "#6b7280",
              marginTop: "0.5rem",
            }}
          >
            Sign In
          </h2>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "500",
                color: "#374151",
              }}
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                marginTop: "0.25rem",
                display: "block",
                width: "100%",
                padding: "0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.375rem",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                fontSize: "0.875rem",
              }}
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "500",
                color: "#374151",
              }}
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                marginTop: "0.25rem",
                display: "block",
                width: "100%",
                padding: "0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.375rem",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                fontSize: "0.875rem",
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.5rem",
              backgroundColor: "#2563eb",
              color: "white",
              fontWeight: "600",
              borderRadius: "0.375rem",
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#1d4ed8")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "#2563eb")
            }
          >
            {loading ? "Signing in..." : "LOGIN"}
          </button>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.875rem",
              color: "#6b7280",
            }}
          >
            <label style={{ display: "flex", alignItems: "center" }}>
              <input type="checkbox" style={{ marginRight: "0.5rem" }} />
              Remember me
            </label>
            <a
              href="#"
              style={{ color: "#2563eb", textDecoration: "underline" }}
            >
              Forgot Password?
            </a>
          </div>
        </form>

        <p
          style={{
            textAlign: "center",
            color: "#9ca3af",
            fontSize: "0.75rem",
            marginTop: "1.5rem",
          }}
        >
          © 2025 DTT Coaching Services, LLC.
        </p>
      </div>
    </div>
  );
}