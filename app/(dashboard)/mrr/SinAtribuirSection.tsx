"use client";

import { useMemo, useState, useTransition } from "react";
import { DealSinAtribuir } from "@/lib/supabase";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/format";
import { attioDealUrl, attioCompanyUrl } from "@/lib/attio";
import { atribuirDealAction, descartarDealAtribucionAction } from "./actions";

const PAGE_SIZE = 10;

// 2026-08-19 (José): cola de revisión de deals de evento sin atribuir. Un deal entra si
// dice ser de evento (origen Evento Presencial MKT / Webinars MKT) o si su empresa está
// taggeada a un evento, pero el deal NO tiene campana_evento. Acciones por deal:
// atribuir (escribe el tag en Attio) o descartar (solo sale de esta cola, Attio intacto).
// Estos deals NO cuentan en ningún número del dashboard hasta que se atribuyan — esta
// sección es la cola de trabajo del hallazgo del 2026-08-18 (89% de deals de evento sin
// atribuir en Attio).
export function SinAtribuirSection({ rows, options }: { rows: DealSinAtribuir[]; options: string[] }) {
  // Optimista: los deals resueltos (atribuidos o descartados) salen de la lista ya.
  const [resolved, setResolved] = useState<Record<string, string>>({}); // dealId -> "atribuido:<slug>" | "descartado"
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "sugerencia" | "presencial" | "webinar" | "empresa">("todos");
  const [page, setPage] = useState(0);

  const pending = useMemo(() => rows.filter((r) => !resolved[r.attio_deal_id]), [rows, resolved]);

  const counts = useMemo(() => ({
    sugerencia: pending.filter((r) => r.sugerencias?.length).length,
    presencial: pending.filter((r) => r.origen_negocio === "Evento Presencial MKT").length,
    webinar: pending.filter((r) => r.origen_negocio === "Webinars MKT").length,
    empresa: pending.filter((r) => !r.origen_evento).length,
  }), [pending]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pending.filter((r) => {
      if (filtro === "sugerencia" && !r.sugerencias?.length) return false;
      if (filtro === "presencial" && r.origen_negocio !== "Evento Presencial MKT") return false;
      if (filtro === "webinar" && r.origen_negocio !== "Webinars MKT") return false;
      if (filtro === "empresa" && r.origen_evento) return false;
      if (q) {
        const hay = `${r.deal_name ?? ""} ${r.company_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pending, filtro, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function setFiltroAndReset(f: typeof filtro) { setFiltro(f); setPage(0); }

  if (!rows.length) return null;

  return (
    <div style={{ marginTop: 48 }}>
      <div className="section-title">Revisión: deals de evento sin atribuir ({pending.length})</div>
      <p className="text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 16, maxWidth: 760 }}>
        Deals que dicen ser de evento (origen <strong>Evento Presencial MKT</strong> / <strong>Webinars MKT</strong>)
        o cuya empresa está taggeada a un evento, pero <strong>sin Campaña/Evento en el deal</strong> — por eso
        no cuentan en ningún número del dashboard. Atribuir escribe el tag en Attio; descartar solo lo saca
        de esta cola (Attio no se toca).
      </p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard value={pending.length} label="Deals sin atribuir" color="var(--fg-status-warning)" />
        <StatCard value={counts.sugerencia} label="Con sugerencia (empresa taggeada)" />
        <StatCard
          value={formatCurrency(pending.reduce((acc, r) => acc + Number(r.value_amount ?? 0), 0))}
          label="Valor sin atribuir"
        />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {([
          ["todos", `Todos (${pending.length})`],
          ["sugerencia", `Con sugerencia (${counts.sugerencia})`],
          ["presencial", `Evento presencial (${counts.presencial})`],
          ["webinar", `Webinars (${counts.webinar})`],
          ["empresa", `Solo empresa taggeada (${counts.empresa})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFiltroAndReset(key)}
            style={{
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              cursor: "pointer",
              background: filtro === key ? "var(--fg-primary)" : "var(--bg-primary)",
              color: filtro === key ? "var(--bg-primary)" : "var(--fg-secondary)",
            }}
          >
            {label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Buscar deal o empresa…"
          style={{
            padding: "6px 10px",
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--border-tertiary)",
            background: "var(--bg-primary)",
            color: "var(--fg-primary)",
            minWidth: 200,
          }}
        />
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="text-muted" style={{ padding: 20, textAlign: "center", fontSize: 13 }}>
          Sin deals pendientes con este filtro. 🎉
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                <th style={thStyle}>Negocio</th>
                <th style={thStyle}>Origen / Etapa</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Creado</th>
                <th style={thStyle}>Atribuir a evento</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <SinAtribuirRow
                  key={r.attio_deal_id}
                  row={r}
                  options={options}
                  onResolved={(status) => setResolved((prev) => ({ ...prev, [r.attio_deal_id]: status }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", marginTop: 10, fontSize: 12 }}>
          <span className="text-muted">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
          </span>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} style={pagBtnStyle}>← Anterior</button>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} style={pagBtnStyle}>Siguiente →</button>
        </div>
      )}
    </div>
  );
}

function SinAtribuirRow({
  row,
  options,
  onResolved,
}: {
  row: DealSinAtribuir;
  options: string[];
  onResolved: (status: string) => void;
}) {
  // Default: si la empresa tiene UNA sola sugerencia, viene preseleccionada.
  const [slug, setSlug] = useState(row.sugerencias?.length === 1 ? row.sugerencias[0] : "");
  const [confirmDescartar, setConfirmDescartar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Sugerencias que no existen como option del deal igual se ofrecen: la edge fn reporta
  // el error crudo de Attio si el slug no es válido para deals.
  const selectOptions = useMemo(() => {
    const set = new Set(options);
    (row.sugerencias ?? []).forEach((s) => set.add(s));
    return [...set].sort();
  }, [options, row.sugerencias]);

  function atribuir(targetSlug: string) {
    setError(null);
    startTransition(async () => {
      const res = await atribuirDealAction([row.attio_deal_id], targetSlug);
      if (res.success && res.updated > 0) {
        onResolved(`atribuido:${targetSlug}`);
      } else {
        // updated=0 con success también es fallo (lección 2026-08-10: el "✓ 0" verde).
        setError(res.error ?? res.errors?.[0] ?? "Attio no aceptó el cambio");
      }
    });
  }

  function descartar() {
    setError(null);
    startTransition(async () => {
      const res = await descartarDealAtribucionAction([row.attio_deal_id]);
      if (res.success) onResolved("descartado");
      else setError(res.error ?? "No se pudo descartar");
    });
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border-tertiary)", opacity: isPending ? 0.5 : 1 }}>
      <td style={tdStyle}>
        <a
          href={attioDealUrl(row.attio_deal_id)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--fg-primary)", textDecoration: "none", fontWeight: 600 }}
        >
          {row.deal_name ?? "— sin nombre —"}
        </a>
        <div style={{ fontSize: 11, marginTop: 2 }}>
          {row.attio_company_id ? (
            <a
              href={attioCompanyUrl(row.attio_company_id) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted"
              style={{ textDecoration: "none" }}
            >
              {row.company_name ?? "empresa →"}
            </a>
          ) : (
            <span className="text-muted">{row.company_name ?? "—"}</span>
          )}
        </div>
        {error && <div style={{ fontSize: 11, color: "var(--fg-status-error)", marginTop: 4 }}>{error}</div>}
      </td>
      <td style={tdStyle}>
        <div style={{ fontSize: 12, color: "var(--fg-secondary)" }}>{row.origen_negocio ?? "— sin origen —"}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>{row.stage ?? "—"}</div>
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
        {row.value_amount != null ? formatCurrency(Number(row.value_amount)) : "—"}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", color: "var(--fg-secondary)", whiteSpace: "nowrap" }}>
        {row.created_at_attio
          ? new Date(row.created_at_attio).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
          : "—"}
      </td>
      <td style={tdStyle}>
        {(row.sugerencias?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {row.sugerencias!.map((s) => (
              <button
                key={s}
                onClick={() => setSlug(s)}
                disabled={isPending}
                title="Sugerencia: la empresa está taggeada a este evento. Click para seleccionar."
                className="badge"
                style={{
                  cursor: "pointer",
                  border: slug === s ? "1px solid var(--fg-primary)" : "1px solid transparent",
                  background: "var(--bg-status-brand)",
                  color: "var(--fg-status-brand)",
                  fontSize: 10,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={isPending}
            style={{
              padding: "5px 8px",
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              background: "var(--bg-secondary)",
              color: slug ? "var(--fg-primary)" : "var(--fg-quaternary)",
              maxWidth: 240,
            }}
          >
            <option value="">— elegir evento —</option>
            {selectOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <button
            onClick={() => slug && atribuir(slug)}
            disabled={isPending || !slug}
            style={{
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--fg-primary)",
              background: "var(--fg-primary)",
              color: "var(--bg-primary)",
              cursor: slug ? "pointer" : "not-allowed",
              opacity: slug ? 1 : 0.5,
              whiteSpace: "nowrap",
            }}
          >
            Atribuir
          </button>
        </div>
      </td>
      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
        {/* Confirmación inline, nunca confirm() nativo (lección 2026-08-10). */}
        {confirmDescartar ? (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <button onClick={descartar} disabled={isPending} style={{ ...descartarBtnStyle, background: "var(--fg-status-error)", color: "var(--bg-primary)" }}>
              Sí, descartar
            </button>
            <button onClick={() => setConfirmDescartar(false)} disabled={isPending} style={descartarBtnStyle}>
              Cancelar
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmDescartar(true)} disabled={isPending} style={descartarBtnStyle} title="Sacar de esta cola (Attio no se toca)">
            Descartar
          </button>
        )}
      </td>
    </tr>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--fg-quaternary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "top",
};

const pagBtnStyle: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-primary)",
  color: "var(--fg-secondary)",
  cursor: "pointer",
};

const descartarBtnStyle: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--fg-status-error)",
  background: "var(--bg-primary)",
  color: "var(--fg-status-error)",
  cursor: "pointer",
};
