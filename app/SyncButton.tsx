"use client";

import { useState } from "react";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const p3 = data?.phase3;
        if (p3?.body?.includes?.("WORKER_RESOURCE_LIMIT")) {
          setResult("Sync sobrecargado · ya hay sync incremental — reintentá");
        } else if (p3?.status) {
          setResult(`Phase ${p3.status}: ${(p3.body ?? "").slice(0, 80) || "sin detalle"}`);
        } else {
          setResult(`Error ${res.status}`);
        }
        return;
      }
      setResult(`${data.list_entries} empresas, ${data.deals} deals nuevos`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "desconocido"}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      style={{
        padding: "4px 12px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 8,
        border: "1px solid var(--border-tertiary)",
        background: syncing ? "var(--bg-tertiary)" : "var(--bg-primary)",
        color: "var(--fg-secondary)",
        cursor: syncing ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span style={{ fontSize: 13 }}>{syncing ? "⟳" : "↻"}</span>
      {syncing ? "Sincronizando..." : result ?? "Sync Attio"}
    </button>
  );
}
