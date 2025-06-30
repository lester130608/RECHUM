'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import DashboardExpirations from '@/components/DashboardExpirations'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notAdminReason, setNotAdminReason] = useState("");

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('DEBUG user:', user);
      if (!user) {
        setNotAdminReason("No user session found. Please log in again.");
        window.location.href = "/not-authorized";
        return;
      }
      const { data: userRow, error } = await supabase
        .from('users')
        .select('role')
        .eq('email', user.email)
        .single();
      console.log('DEBUG userRow:', userRow, 'error:', error, 'email:', user.email);
      if (error) {
        setNotAdminReason("Error fetching user role: " + error.message);
      } else if (!userRow) {
        setNotAdminReason("User not found in users table: " + user.email);
      } else if (userRow.role !== "admin") {
        setNotAdminReason("User is not admin. Role: " + userRow.role);
      }
      if (userRow?.role === "admin") {
        setIsAdmin(true);
      } else {
        window.location.href = "/not-authorized";
      }
      setLoading(false);
    };
    checkAdmin();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!isAdmin) return <div style={{color: 'red', padding: 24}}>{notAdminReason || "Not authorized."}</div>;

  let dashboardExpirationsContent = null;
  try {
    dashboardExpirationsContent = <DashboardExpirations />;
  } catch (err) {
    dashboardExpirationsContent = <div style={{color: 'red'}}>Error en DashboardExpirations: {String(err)}</div>;
  }

  return (
    <>
      <div style={{ padding: "2rem", fontFamily: "Segoe UI, sans-serif" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
          Welcome to the Admin Dashboard
        </h1>
        <p style={{ marginTop: "1rem", color: "#4b5563" }}>
          From here you can manage employees, reports, and system settings.
        </p>
      </div>
      <div style={{ marginTop: "2rem" }}>
        {dashboardExpirationsContent}
      </div>
    </>
  );
}
