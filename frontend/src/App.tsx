import { useEffect, useState } from "react";
import { getHealth, type HealthResponse } from "./api";

type Load = { state: "loading" } | { state: "ok"; data: HealthResponse } | { state: "error" };

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        marginRight: 8,
        background: ok ? "#22c55e" : "#ef4444",
      }}
    />
  );
}

export default function App() {
  const [health, setHealth] = useState<Load>({ state: "loading" });

  useEffect(() => {
    getHealth()
      .then((data) => setHealth({ state: "ok", data }))
      .catch(() => setHealth({ state: "error" }));
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "4rem auto",
        padding: "0 1rem",
        color: "#0f172a",
      }}
    >
      <h1>Art Caffe Examination System</h1>
      <p style={{ color: "#475569" }}>Infrastructure skeleton — end-to-end wiring check.</p>

      <section
        style={{
          marginTop: "2rem",
          padding: "1rem 1.25rem",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
        }}
      >
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Stack status</h2>
        {health.state === "loading" && <p>Checking backend…</p>}
        {health.state === "error" && (
          <p style={{ color: "#ef4444" }}>Could not reach the backend /api/health/ endpoint.</p>
        )}
        {health.state === "ok" && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, lineHeight: 2 }}>
            <li>
              <Dot ok={health.data.status === "ok"} /> API: {health.data.status}
            </li>
            <li>
              <Dot ok={health.data.db === "ok"} /> Database: {health.data.db}
            </li>
            <li>
              <Dot ok={health.data.redis === "ok"} /> Redis: {health.data.redis}
            </li>
          </ul>
        )}
      </section>
    </main>
  );
}
