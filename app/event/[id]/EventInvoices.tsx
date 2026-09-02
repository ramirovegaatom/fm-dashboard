"use client";

import { useRef, useState, useTransition } from "react";
import { supabase, EventInvoice } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { addEventInvoice, deleteEventInvoice } from "./actions";
import { addThirdPartyInvoice, deleteThirdPartyInvoice } from "@/app/(dashboard)/third-party/actions";

type Tipo = "gasto" | "ingreso";
type Variant = "event" | "thirdparty";
type ActionResult = { success: boolean; error?: string };
type AddFn = (id: string, concepto: string, monto: number, pdfUrl: string | null, tipo: "gasto" | "ingreso") => Promise<ActionResult>;
type DelFn = (id: string, invoiceId: string) => Promise<ActionResult>;

// 2026-07-07 (Jose): facturas/gastos del evento como ítems (concepto + monto + PDF).
// 2026-07-10 (Jose): mismo patrón para INGRESOS (MDF, aportes de partner). El costo total
// del evento = suma de gastos − suma de ingresos (neto). Este componente sirve para ambos.
// 2026-09-02: endurecido tras reporte "el PDF no se guarda" (Fenabrave, 2026-08-31). En Supabase
// no llegó NINGÚN intento de upload esos días y los ítems se insertaron con pdf_url NULL, o sea
// el navegador no tenía archivo al hacer clic. No se pudo reproducir (PDF de 300 B y de 9 MB
// suben bien). Cambios: el File se guarda en estado (no depende del input DOM), se acepta .pdf
// aunque el SO no informe el MIME, el upload tiene timeout, los errores se muestran grandes y
// con la causa real, hay confirmación visible al guardar y logs `[facturas]` en consola.
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

const BUCKET = "event-invoices";
const UPLOAD_TIMEOUT_MS = 120_000;
const MAX_PDF_MB = 50; // límite por defecto de Supabase Storage por archivo

function log(...args: unknown[]) {
  // Prefijo fijo para poder pedirle a quien reporta un problema que filtre la consola por "[facturas]".
  console.info("[facturas]", ...args);
}

/** PDF por MIME o, si el sistema operativo no lo informa (pasa en Windows), por extensión. */
function isPdf(file: File): boolean {
  if (file.type === "application/pdf") return true;
  const noMime = file.type === "" || file.type === "application/octet-stream";
  return noMime && file.name.toLowerCase().endsWith(".pdf");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 0",
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
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await delFn(eventId, inv.id).catch((e) => ({ success: false, error: String(e) }));
              if (!res.success) setError(res.error ?? "No se pudo borrar.");
            })
          }
          disabled={isPending}
          title={cfg.deleteTitle}
          style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--fg-status-error)" }}
        >
          ✕
        </button>
      </div>
      {error && <div className="text-error" style={{ fontSize: 11, paddingBottom: 6 }}>{error}</div>}
    </div>
  );
}

function AddInvoiceForm({ eventId, tipo, cfg, addFn }: { eventId: string; tipo: Tipo; cfg: typeof CFG[Tipo]; addFn: AddFn }) {
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  // El File vive en estado: si el <input type=file> se resetea o remonta, no perdemos el archivo elegido.
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = uploading || isPending;

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    setSavedMsg(null);
    if (f && !isPdf(f)) {
      log("archivo rechazado (no es PDF)", { name: f.name, type: f.type || "(sin MIME)", size: f.size });
      setFile(null);
      setError(`"${f.name}" no parece un PDF (tipo detectado: ${f.type || "desconocido"}). Elegí un archivo .pdf.`);
      return;
    }
    if (f && f.size > MAX_PDF_MB * 1024 * 1024) {
      setFile(null);
      setError(`El PDF pesa ${formatBytes(f.size)}; el máximo es ${MAX_PDF_MB} MB.`);
      return;
    }
    setFile(f);
    if (f) log("archivo elegido", { name: f.name, type: f.type || "(sin MIME)", size: f.size });
  }

  function clearFile() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadPdf(f: File): Promise<string> {
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${eventId}/${tipo}-${Date.now()}-${safeName}`;
    log("subiendo PDF", { path, size: f.size });
    const t0 = performance.now();
    const upload = supabase.storage.from(BUCKET).upload(path, f, { upsert: true, contentType: "application/pdf" });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`la subida tardó más de ${UPLOAD_TIMEOUT_MS / 1000}s (¿conexión lenta o bloqueada a *.supabase.co?)`)), UPLOAD_TIMEOUT_MS)
    );
    const { error: upErr } = await Promise.race([upload, timeout]);
    if (upErr) throw new Error(upErr.message);
    log(`PDF subido en ${Math.round(performance.now() - t0)} ms`);
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function handleAdd() {
    setError(null);
    setSavedMsg(null);
    const num = parseFloat(monto);
    if (!concepto.trim()) { setError(cfg.emptyConcepto); return; }
    if (Number.isNaN(num) || num < 0) { setError("Monto inválido."); return; }

    // Estado primero; el input DOM como respaldo por si el estado quedó desincronizado.
    const f = file ?? fileRef.current?.files?.[0] ?? null;
    const inputHasFile = (fileRef.current?.files?.length ?? 0) > 0;
    log("agregar", { eventId, tipo, concepto: concepto.trim(), monto: num, file: f ? { name: f.name, size: f.size, type: f.type } : null, inputHasFile });

    let url: string | null = null;
    if (f) {
      if (!isPdf(f)) { setError("El archivo debe ser un PDF."); return; }
      setUploading(true);
      try {
        url = await uploadPdf(f);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log("ERROR subiendo PDF", msg);
        setError(`No se subió el PDF (el ítem NO se guardó): ${msg}`);
        return;
      } finally {
        setUploading(false);
      }
    }

    const hadFile = !!f;
    startTransition(async () => {
      const res = await addFn(eventId, concepto, num, url, tipo).catch((e) => ({ success: false, error: String(e) } as ActionResult));
      if (!res.success) {
        log("ERROR guardando ítem", res.error);
        setError(res.error ?? "No se pudo guardar el ítem.");
        return;
      }
      log("ítem guardado", { conPdf: hadFile });
      setConcepto("");
      setMonto("");
      clearFile();
      setSavedMsg(hadFile ? "Guardado con PDF ✓" : "Guardado (sin PDF) ✓");
      setTimeout(() => setSavedMsg(null), 4000);
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
      <div style={{ flex: 1, minWidth: 150 }}>
        <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>PDF (prueba, opcional)</div>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={onPickFile} style={{ fontSize: 11, color: "var(--fg-secondary)" }} />
        {file && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11 }}>
            <span style={{ color: "var(--fg-status-success)", fontWeight: 600 }}>📎 {file.name}</span>
            <span className="text-muted">({formatBytes(file.size)})</span>
            <button onClick={clearFile} type="button" title="Quitar archivo" style={{ all: "unset", cursor: "pointer", color: "var(--fg-status-error)", fontSize: 11 }}>✕</button>
          </div>
        )}
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
          opacity: busy ? 0.7 : 1,
        }}
      >
        {uploading ? "Subiendo PDF…" : isPending ? "Guardando…" : "Agregar"}
      </button>
      {savedMsg && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-status-success)", flexBasis: "100%" }}>{savedMsg}</div>
      )}
      {error && (
        <div
          className="text-error"
          role="alert"
          style={{ fontSize: 12, fontWeight: 600, flexBasis: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--bg-status-error)" }}
        >
          {error}
        </div>
      )}
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
