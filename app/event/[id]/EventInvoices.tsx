"use client";

import { useRef, useState, useTransition } from "react";
import { supabase, EventInvoice } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { addEventInvoice, deleteEventInvoice } from "./actions";
import { addThirdPartyInvoice, deleteThirdPartyInvoice } from "@/app/(dashboard)/third-party/actions";

type Tipo = "gasto" | "ingreso";
type Variant = "event" | "thirdparty";
type AddFn = (id: string, concepto: string, monto: number, pdfUrl: string | null, tipo: "gasto" | "ingreso") => Promise<{ success: boolean }>;
type DelFn = (id: string, invoiceId: string) => Promise<{ success: boolean }>;

// 2026-07-07 (Jose): facturas/gastos del evento como ítems (concepto + monto + PDF).
// 2026-07-10 (Jose): mismo patrón para INGRESOS (MDF, aportes de partner). El costo total
// del evento = suma de gastos − suma de ingresos (neto). Este componente sirve para ambos.
const CFG: Record<Tipo, {
  title: string;
  conceptoLabel: string;
  placeholder: string;
  totalLabel: string;
  deleteTitle: string;
  note: string;
  amountColor?: string;
  emptyConcepto: string;
}> = {
  gasto: {
    title: "Facturas / gastos del evento",
    conceptoLabel: "Concepto (qué se gastó)",
    placeholder: "Ej: Catering, venue, impresión…",
    totalLabel: "Total gastos:",
    deleteTitle: "Eliminar gasto",
    note: "El costo bruto del evento se calcula sumando los gastos cargados acá.",
    emptyConcepto: "Poné el concepto (qué se gastó).",
  },
  ingreso: {
    title: "Ingresos del evento (MDF, aportes de partner…)",
    conceptoLabel: "Concepto (qué ingresó)",
    placeholder: "Ej: MDF Google, aporte Partner X…",
    totalLabel: "Total ingresos:",
    deleteTitle: "Eliminar ingreso",
    note: "Los ingresos se restan del costo total del evento (costo neto = gastos − ingresos).",
    amountColor: "var(--fg-status-success)",
    emptyConcepto: "Poné el concepto (qué ingresó).",
  },
};

export function EventInvoices({
  eventId,
  invoices,
  tipo = "gasto",
  variant = "event",
}: {
  eventId: string;
  invoices: EventInvoice[];
  tipo?: Tipo;
  variant?: Variant;
}) {
  const cfg = CFG[tipo];
  const addFn: AddFn = variant === "thirdparty" ? addThirdPartyInvoice : addEventInvoice;
  const delFn: DelFn = variant === "thirdparty" ? deleteThirdPartyInvoice : deleteEventInvoice;
  const [open, setOpen] = useState(false);
  const total = invoices.reduce((acc, i) => acc + Number(i.monto ?? 0), 0);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}>
          {cfg.title}
          <span className="badge" style={{ background: "var(--bg-secondary)", color: cfg.amountColor ?? "var(--fg-secondary)", fontSize: 10 }}>
            {invoices.length} · {formatCurrency(total)}
          </span>
        </span>
        <span className="text-muted" style={{ fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {invoices.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
              {invoices.map((inv) => (
                <InvoiceRow key={inv.id} eventId={eventId} inv={inv} cfg={cfg} delFn={delFn} />
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, fontSize: 13, fontWeight: 700 }}>
                <span className="text-muted" style={{ fontWeight: 500 }}>{cfg.totalLabel}</span>
                <span style={cfg.amountColor ? { color: cfg.amountColor } : undefined}>{formatCurrency(total)}</span>
              </div>
            </div>
          )}
          <AddInvoiceForm eventId={eventId} tipo={tipo} cfg={cfg} addFn={addFn} />
          <div className="text-muted" style={{ fontSize: 10, marginTop: 6 }}>
            {cfg.note}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ eventId, inv, cfg, delFn }: { eventId: string; inv: EventInvoice; cfg: typeof CFG[Tipo]; delFn: DelFn }) {
  const [isPending, startTransition] = useTransition();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border-tertiary)",
        opacity: isPending ? 0.5 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {inv.concepto}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, ...(cfg.amountColor ? { color: cfg.amountColor } : {}) }}>{formatCurrency(Number(inv.monto))}</div>
      {inv.pdf_url ? (
        <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--fg-status-info)", whiteSpace: "nowrap" }}>
          Ver PDF ↗
        </a>
      ) : (
        <span className="text-muted" style={{ fontSize: 11 }}>sin PDF</span>
      )}
      <button
        onClick={() => startTransition(async () => { await delFn(eventId, inv.id); })}
        disabled={isPending}
        title={cfg.deleteTitle}
        style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--fg-status-error)" }}
      >
        ✕
      </button>
    </div>
  );
}

function AddInvoiceForm({ eventId, tipo, cfg, addFn }: { eventId: string; tipo: Tipo; cfg: typeof CFG[Tipo]; addFn: AddFn }) {
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = uploading || isPending;

  async function handleAdd() {
    setError(null);
    const num = parseFloat(monto);
    if (!concepto.trim()) { setError(cfg.emptyConcepto); return; }
    if (Number.isNaN(num) || num < 0) { setError("Monto inválido."); return; }

    const file = fileRef.current?.files?.[0] ?? null;
    let url: string | null = null;
    if (file) {
      if (file.type !== "application/pdf") { setError("El archivo debe ser un PDF."); return; }
      setUploading(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${eventId}/${tipo}-${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("event-invoices")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      setUploading(false);
      if (upErr) { setError(`Error subiendo el PDF: ${upErr.message}`); return; }
      url = supabase.storage.from("event-invoices").getPublicUrl(path).data.publicUrl;
    }

    startTransition(async () => {
      try {
        await addFn(eventId, concepto, num, url, tipo);
        setConcepto("");
        setMonto("");
        setFileName(null);
        if (fileRef.current) fileRef.current.value = "";
      } catch (e) {
        setError(String(e));
      }
    });
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", paddingTop: 4 }}>
      <div style={{ flex: 2, minWidth: 160 }}>
        <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>{cfg.conceptoLabel}</div>
        <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder={cfg.placeholder} style={{ ...inputStyle, width: "100%" }} />
      </div>
      <div style={{ flex: 1, minWidth: 100 }}>
        <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Monto (USD)</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>$</span>
          <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" style={{ ...inputStyle, width: "100%" }} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 130 }}>
        <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>PDF (prueba, opcional)</div>
        <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} style={{ fontSize: 11, color: "var(--fg-secondary)" }} />
        {fileName && <div className="text-muted" style={{ fontSize: 10, marginTop: 2, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>}
      </div>
      <button
        onClick={handleAdd}
        disabled={busy}
        style={{
          padding: "7px 14px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 8,
          border: "none",
          background: "var(--bg-inverse-primary)",
          color: "var(--fg-inverse-primary)",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {uploading ? "Subiendo…" : isPending ? "Agregando…" : "Agregar"}
      </button>
      {error && <div className="text-error" style={{ fontSize: 11, flexBasis: "100%" }}>{error}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 13,
  border: "1px solid var(--border-tertiary)",
  borderRadius: 8,
  background: "var(--bg-secondary)",
  color: "var(--fg-primary)",
  outline: "none",
};
