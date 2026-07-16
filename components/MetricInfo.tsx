"use client";

import { useEffect, useRef, useState } from "react";
import { getLineage } from "@/lib/metric-lineage";
import { LineagePopover } from "./LineagePopover";

export function MetricInfo({
  metricKey,
  size = 14,
}: {
  metricKey?: string;
  size?: number;
}) {
  const entry = getLineage(metricKey);
  const buttonRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  if (!entry) return null;

  function handleToggle(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    if (buttonRef.current) {
      setAnchorRect(buttonRef.current.getBoundingClientRect());
    }
    setOpen(true);
  }

  return (
    <>
      <span
        ref={buttonRef}
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleToggle(e);
        }}
        aria-label={`Cómo se calcula ${entry.label}`}
        title={`Cómo se calcula ${entry.label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size + 4,
          height: size + 4,
          borderRadius: "50%",
          cursor: "pointer",
          color: open ? "var(--fg-tertiary, #525252)" : "var(--fg-quaternary, #a3a3a3)",
          verticalAlign: "middle",
          flexShrink: 0,
          outline: "none",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLSpanElement).style.color = "var(--fg-tertiary, #525252)";
        }}
        onMouseLeave={(e) => {
          if (!open) {
            (e.currentTarget as HTMLSpanElement).style.color = "var(--fg-quaternary, #a3a3a3)";
          }
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </span>
      {open && (
        <LineagePopover entry={entry} onClose={() => setOpen(false)} anchorRect={anchorRect} />
      )}
    </>
  );
}
