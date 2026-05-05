"use client";

import { LineageEntry, LineageNode, LineageNodeKind, METRIC_LINEAGE } from "@/lib/metric-lineage";

const KIND_COLORS: Record<LineageNodeKind, { bg: string; fg: string; border: string }> = {
  source: {
    bg: "var(--bg-status-info, #eef4ff)",
    fg: "var(--fg-status-info, #1d4ed8)",
    border: "var(--fg-status-info, #1d4ed8)",
  },
  pipeline: {
    bg: "var(--bg-status-warning, #fff8e6)",
    fg: "var(--fg-status-warning, #b45309)",
    border: "var(--fg-status-warning, #b45309)",
  },
  store: {
    bg: "var(--bg-secondary, #f4f4f5)",
    fg: "var(--fg-secondary, #404040)",
    border: "var(--border-tertiary, #d4d4d8)",
  },
  ui: {
    bg: "var(--bg-status-success, #ecfdf5)",
    fg: "var(--fg-status-success, #047857)",
    border: "var(--fg-status-success, #047857)",
  },
};

function FlowChip({ node }: { node: LineageNode }) {
  const c = KIND_COLORS[node.kind];
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          padding: "4px 8px",
          borderRadius: 6,
          background: c.bg,
          color: c.fg,
          border: `1px solid ${c.border}`,
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {node.label}
      </span>
      {node.detail && (
        <span
          className="text-muted"
          style={{ fontSize: 9, lineHeight: 1.2, textAlign: "center", maxWidth: 100 }}
        >
          {node.detail}
        </span>
      )}
    </div>
  );
}

function FlowDiagram({ flow }: { flow: LineageNode[] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 4,
        overflowX: "auto",
        padding: "4px 0",
      }}
    >
      {flow.map((node, i) => (
        <div
          key={`${node.label}-${i}`}
          style={{ display: "flex", alignItems: "flex-start", gap: 4 }}
        >
          <FlowChip node={node} />
          {i < flow.length - 1 && (
            <span
              style={{
                color: "var(--fg-quaternary, #a3a3a3)",
                fontSize: 13,
                paddingTop: 4,
                flexShrink: 0,
              }}
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8, alignItems: "baseline" }}>
      <span className="text-muted" style={{ fontSize: 11, fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: 1.4 }}>
        {children}
      </span>
    </div>
  );
}

export function LineagePopover({
  entry,
  onClose,
  anchorRect,
}: {
  entry: LineageEntry;
  onClose: () => void;
  anchorRect: DOMRect | null;
}) {
  const POPOVER_WIDTH = 360;
  const MARGIN = 8;

  const positioning: React.CSSProperties = (() => {
    if (!anchorRect) {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 768;

    if (vw < 480) {
      return {
        left: 8,
        right: 8,
        bottom: 8,
        width: "auto",
        maxWidth: "none",
      };
    }

    let left = anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2;
    if (left + POPOVER_WIDTH > vw - MARGIN) left = vw - POPOVER_WIDTH - MARGIN;
    if (left < MARGIN) left = MARGIN;

    const spaceBelow = vh - anchorRect.bottom;
    const placeAbove = spaceBelow < 280 && anchorRect.top > 280;
    const top = placeAbove
      ? Math.max(MARGIN, anchorRect.top - 8 - 280)
      : anchorRect.bottom + 8;

    return { top, left, width: POPOVER_WIDTH };
  })();

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "transparent",
          zIndex: 998,
        }}
      />
      <div
        role="dialog"
        aria-label={`Trazabilidad de ${entry.label}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          ...positioning,
          maxHeight: "min(80vh, 500px)",
          overflow: "auto",
          background: "var(--bg-primary, #ffffff)",
          border: "1px solid var(--border-tertiary, #d4d4d8)",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          padding: 16,
          zIndex: 999,
          color: "var(--fg-primary, #18181b)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.label}</div>
          <span
            role="button"
            tabIndex={0}
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClose();
              }
            }}
            aria-label="Cerrar"
            style={{
              cursor: "pointer",
              fontSize: 14,
              color: "var(--fg-quaternary, #a3a3a3)",
              padding: "0 4px",
              userSelect: "none",
            }}
          >
            ✕
          </span>
        </div>

        <div
          style={{
            paddingBottom: 10,
            borderBottom: "1px solid var(--border-tertiary, #d4d4d8)",
            marginBottom: 10,
          }}
        >
          <div className="text-muted" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
            Flow
          </div>
          <FlowDiagram flow={entry.flow} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {entry.table && <MetaRow label="Tabla">{entry.table}</MetaRow>}
          {entry.column && <MetaRow label="Columna">{entry.column}</MetaRow>}
          {entry.filter && <MetaRow label="Filtro">{entry.filter}</MetaRow>}
          <MetaRow label="Update">{entry.update}</MetaRow>
          {entry.derivedFrom && entry.derivedFrom.length > 0 && (
            <MetaRow label="Deriva de">
              {entry.derivedFrom
                .map((k) => METRIC_LINEAGE[k]?.label ?? k)
                .join(" · ")}
            </MetaRow>
          )}
        </div>

        {entry.note && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              background: "var(--bg-secondary, #f4f4f5)",
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1.45,
              color: "var(--fg-secondary, #404040)",
            }}
          >
            {entry.note}
          </div>
        )}
      </div>
    </>
  );
}
