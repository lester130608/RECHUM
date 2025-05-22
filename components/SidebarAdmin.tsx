"use client";

import Link from "next/link";
import { useState } from "react";

export default function SidebarAdmin() {
  const [showHR, setShowHR] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <aside
      style={{
        width: "220px",
        backgroundColor: "#ffffff",
        borderRight: "1px solid #ddd",
        padding: "20px",
        boxShadow: "2px 0 5px rgba(0,0,0,0.05)",
        height: "100vh",
      }}
    >
      <h2 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "16px" }}>
        Admin Panel
      </h2>

      <nav>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li style={linkItem}>
            <Link href="/dashboard/payroll" style={linkStyle}>Payroll</Link>
          </li>

          <li style={linkItem}>
            <button
              onClick={() => setShowHR(!showHR)}
              style={{ ...linkStyle, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              HR {showHR ? "▾" : "▸"}
            </button>
            {showHR && (
              <ul style={{ listStyle: "none", paddingLeft: "1rem", marginTop: "0.5rem" }}>
                <li><Link href="/employees/hr/new" style={subLinkStyle}>New Employee</Link></li>
                <li><Link href="/employees/hr/all" style={subLinkStyle}>All Employees</Link></li>
                <li><Link href="/employees/hr/delete" style={subLinkStyle}>Delete Employee</Link></li>
              </ul>
            )}
          </li>

          <li style={linkItem}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{ ...linkStyle, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              Settings {showSettings ? "▾" : "▸"}
            </button>
            {showSettings && (
              <ul style={{ listStyle: "none", paddingLeft: "1rem", marginTop: "0.5rem" }}>
                <li><Link href="/dashboard/settings/create-hr" style={subLinkStyle}>Create HR Supervisor</Link></li>
                <li><Link href="/dashboard/settings/create-admin" style={subLinkStyle}>Create Full Admin</Link></li>
              </ul>
            )}
          </li>

          <li style={linkItem}>
            <Link href="/dashboard/reports" style={linkStyle}>Reports</Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

const linkItem = { marginBottom: "1rem" };

const linkStyle = {
  color: "#2563eb",
  textDecoration: "none",
  fontSize: "0.875rem",
  display: "inline-block",
};

const subLinkStyle = {
  ...linkStyle,
  padding: "4px 0",
  fontSize: "0.85rem",
};