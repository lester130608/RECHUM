"use client";
import { useRouter } from "next/navigation";

export default function BackButton({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      style={{
        marginBottom: "1rem",
        padding: "0.5rem 1rem",
        background: "#e5e7eb",
        border: "none",
        borderRadius: "0.375rem",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}