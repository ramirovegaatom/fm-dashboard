"use client";

import { useState } from "react";

const SYNC_URL = "https://xwjjvocsnznikeyeqioc.supabase.co/functions/v1/fm-attio-sync";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const [r1, r3] = await Promise.all([
        fetch(`${SYNC_URL}?phase=1`).then(r => r.json()),
        fetch(`${SYNC_URL}?phase=3`).then(r => r.json()),
      ]);
      setResult(`${r1.list_entries ?? 0} empresas, ${r3.deals ?? 0} deals`);
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setResult("Error al sincronizar");
    }
    setSyncing(false);
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
