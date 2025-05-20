export default function NotAuthorizedPage() {
    return (
      <div
        style={{
          padding: "3rem",
          textAlign: "center",
          fontFamily: "Segoe UI, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: "bold", color: "#dc2626" }}>
          🚫 Access Denied
        </h1>
        <p style={{ marginTop: "1rem", color: "#4b5563", fontSize: "1rem" }}>
          You do not have permission to view this page.
        </p>
      </div>
    );
  }