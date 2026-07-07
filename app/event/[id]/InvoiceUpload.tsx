"use client";

import { useRef, useState, useTransition } from "react";
import { supabase } from "@/lib/supabase";
import { saveInvoiceUrl } from "./actions";

// 2026-07-06 (Jose): sección post-evento desplegable para subir el PDF de la factura
// y cargar el monto total (= costo del evento). El PDF se sube directo a Supabase
// Storage desde el cliente (evita el límite de body de los server actions); el server
// action solo persiste la URL + el monto.
export function InvoiceUpload({
  eventId,
  currentUrl,
  currentAmount,
}: {
  eventId: string;
  currentUrl: string | null;
  currentAmount: number;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(currentAmount > 0 ? String(currentAmount) : "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = uploading || isPending;

  async function handleSave() {
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    const num = amount ? parseFloat(amount) : undefined;
    if (!file && !currentUrl && (num === undefined || Number.isNaN(num))) {
      setError("Subí un PDF o cargá el monto.");
      return;
    }
    let url = currentUrl;

    if (file) {
      if (file.type !== "application/pdf") {
        setError("El archivo debe ser un PDF.");
        return;
      }
      setUploading(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${eventId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("event-invoices")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      setUploading(false);
      if (upErr) {
        setError(`Error subiendo el PDF: ${upErr.message}`);
        return;
      }
      url = supabase.storage.from("event-invoices").getPublicUrl(path).data.publicUrl;
    }

    startTransition(async () => {
      try {
        await saveInvoiceUrl(
          eventId,
          url,
          typeof num === "number" && !Number.isNaN(num) ? num : undefined
        );
        setSaved(true);
        setFileName(null);
        if (fileRef.current) fileRef.current.value = "";
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError(String(e));
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}>
          Factura del evento
          {currentUrl && (
            <span
              className="badge"
              style={{ background: "var(--bg-status-success)", color: "var(--fg-status-success)", fontSize: 10 }}
            >
              PDF cargado
            </span>
          )}
        </span>
        <span className="text-muted" style={{ fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
            <div>
              <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>
                PDF de la factura
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                style={{ fontSize: 12, color: "var(--fg-secondary)" }}
              />
              {fileName && (
                <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>{fileName}</div>
              )}
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>
                Monto total (USD) — costo del evento
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: 15,
                    fontWeight: 600,
                    border: "1px solid var(--border-tertiary)",
                    borderRadius: 8,
                    background: "var(--bg-secondary)",
                    color: "var(--fg-primary)",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={busy}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background: saved ? "var(--bg-status-success)" : "var(--bg-inverse-primary)",
                color: saved ? "var(--fg-status-success)" : "var(--fg-inverse-primary)",
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {uploading ? "Subiendo…" : isPending ? "Guardando…" : saved ? "Guardado" : "Guardar"}
            </button>
            {currentUrl && (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: "var(--fg-status-info)" }}
              >
                Ver factura actual ↗
              </a>
            )}
          </div>

          {error && (
            <div className="text-error" style={{ fontSize: 11 }}>{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
