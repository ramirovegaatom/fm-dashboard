"use client";

import { useEffect, useRef, useState } from "react";

export type DateRange = { from?: Date; to?: Date };
export type Preset = "Q1" | "Q2" | "Q3" | "Q4" | "H1" | "H2" | "YTD" | "30d";

function presetRange(preset: Preset, year: number): DateRange {
  switch (preset) {
    case "Q1": return { from: new Date(year, 0, 1), to: new Date(year, 2, 31) };
    case "Q2": return { from: new Date(year, 3, 1), to: new Date(year, 5, 30) };
    case "Q3": return { from: new Date(year, 6, 1), to: new Date(year, 8, 30) };
    case "Q4": return { from: new Date(year, 9, 1), to: new Date(year, 11, 31) };
    case "H1": return { from: new Date(year, 0, 1), to: new Date(year, 5, 30) };
    case "H2": return { from: new Date(year, 6, 1), to: new Date(year, 11, 31) };
    case "YTD": return { from: new Date(year, 0, 1), to: new Date() };
    case "30d": {
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - 30);
      return { from, to };
    }
  }
}

function fmtShort(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function toInputDate(d?: Date) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeMatchesPreset(range: DateRange, preset: Preset, year: number): boolean {
  if (!range.from || !range.to) return false;
  const target = presetRange(preset, year);
  if (!target.from || !target.to) return false;
  // Same-day comparison ignoring time.
  return (
    range.from.toDateString() === target.from.toDateString() &&
    range.to.toDateString() === target.to.toDateString()
  );
}

export function DateFilter({
  value,
  onChange,
  year = new Date().getFullYear(),
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  year?: number;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [tempFrom, setTempFrom] = useState(toInputDate(value.from));
  const [tempTo, setTempTo] = useState(toInputDate(value.to));
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomMode(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    setTempFrom(toInputDate(value.from));
    setTempTo(toInputDate(value.to));
  }, [value.from, value.to]);

  const display = (() => {
    if (value.from && value.to) {
      const presets: Preset[] = ["YTD", "Q1", "Q2", "Q3", "Q4", "H1", "H2", "30d"];
      const matched = presets.find((p) => rangeMatchesPreset(value, p, year));
      if (matched === "30d") return "Últimos 30 días";
      if (matched) return `${matched} ${year}`;
      return `${fmtShort(value.from)} → ${fmtShort(value.to)}`;
    }
    if (value.from) return `Desde ${fmtShort(value.from)}`;
    if (value.to) return `Hasta ${fmtShort(value.to)}`;
    return "Todas las fechas";
  })();

  const isActive = !!(value.from || value.to);

  function applyPreset(preset: Preset) {
    onChange(presetRange(preset, year));
    setOpen(false);
  }

  function applyCustom() {
    const from = tempFrom ? new Date(tempFrom + "T00:00:00") : undefined;
    const to = tempTo ? new Date(tempTo + "T23:59:59") : undefined;
    onChange({ from, to });
    setOpen(false);
    setCustomMode(false);
  }

  function clear() {
    onChange({});
    setOpen(false);
    setCustomMode(false);
  }

  const presetBtnStyle: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    border: "1px solid var(--border-tertiary)",
    background: "var(--bg-primary)",
    color: "var(--fg-secondary)",
    cursor: "pointer",
    textAlign: "center",
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "4px 12px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 8,
          border: "1px solid var(--border-tertiary)",
          background: isActive ? "var(--fg-primary)" : "var(--bg-primary)",
          color: isActive ? "var(--bg-primary)" : "var(--fg-secondary)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 28,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{display}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            background: "var(--bg-primary)",
            border: "1px solid var(--border-tertiary)",
            borderRadius: 12,
            boxShadow: "0px 8px 24px rgba(9,9,11,0.12)",
            padding: 12,
            width: 280,
          }}
        >
          {!customMode ? (
            <>
              <div className="section-title" style={{ marginBottom: 8 }}>
                Año {year}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 8 }}>
                {(["Q1", "Q2", "Q3", "Q4"] as Preset[]).map((p) => (
                  <button key={p} onClick={() => applyPreset(p)} style={presetBtnStyle}>{p}</button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 8 }}>
                <button onClick={() => applyPreset("H1")} style={presetBtnStyle}>H1</button>
                <button onClick={() => applyPreset("H2")} style={presetBtnStyle}>H2</button>
                <button onClick={() => applyPreset("YTD")} style={presetBtnStyle}>YTD</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                <button onClick={() => applyPreset("30d")} style={presetBtnStyle}>Últimos 30d</button>
                <button onClick={clear} style={presetBtnStyle}>Todo</button>
              </div>
              <div style={{ borderTop: "1px solid var(--border-tertiary)", paddingTop: 8 }}>
                <button
                  onClick={() => setCustomMode(true)}
                  style={{
                    ...presetBtnStyle,
                    width: "100%",
                    background: "var(--bg-status-brand)",
                    color: "var(--fg-status-brand)",
                    borderColor: "transparent",
                  }}
                >
                  Rango específico…
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="section-title" style={{ marginBottom: 8 }}>Rango específico</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-secondary)" }}>
                  Desde
                  <input
                    type="date"
                    value={tempFrom}
                    onChange={(e) => setTempFrom(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 4,
                      padding: "6px 8px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid var(--border-tertiary)",
                      background: "var(--bg-primary)",
                      color: "var(--fg-primary)",
                    }}
                  />
                </label>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-secondary)" }}>
                  Hasta
                  <input
                    type="date"
                    value={tempTo}
                    onChange={(e) => setTempTo(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 4,
                      padding: "6px 8px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid var(--border-tertiary)",
                      background: "var(--bg-primary)",
                      color: "var(--fg-primary)",
                    }}
                  />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button onClick={() => setCustomMode(false)} style={presetBtnStyle}>Atrás</button>
                <button
                  onClick={applyCustom}
                  style={{
                    ...presetBtnStyle,
                    background: "var(--fg-primary)",
                    color: "var(--bg-primary)",
                    borderColor: "transparent",
                  }}
                >
                  Aplicar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function filterByDateRange<T extends { evento_fecha: string }>(
  events: T[],
  range: DateRange
): T[] {
  if (!range.from && !range.to) return events;
  return events.filter((e) => {
    const d = new Date(e.evento_fecha);
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
}
