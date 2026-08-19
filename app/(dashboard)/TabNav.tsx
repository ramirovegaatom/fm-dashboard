"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Principal" },
  { href: "/calendario", label: "Calendario" },
  { href: "/partners", label: "Partners" },
  { href: "/pauta", label: "Pauta" },
  { href: "/third-party", label: "Third Party" },
  // 2026-08-06 (confusión Candela): renombrados para que digan qué pregunta responde cada
  // uno — Estado actual = foto de HOY del funnel; Semana a semana = qué pasó cada semana.
  { href: "/seguimiento", label: "Estado actual" },
  { href: "/semanal", label: "Semana a semana" },
  // 2026-08-19 (José): "MRR cerrado" → "Deals". Mismo contenido (Won por fecha de cierre)
  // + cola de revisión de deals de evento sin atribuir.
  { href: "/mrr", label: "Deals" },
];

export function TabNav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-tertiary)" }}>
      {TABS.map((t) => {
        const isActive = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? "var(--fg-primary)" : "var(--fg-quaternary)",
              borderBottom: isActive ? "2px solid var(--fg-primary)" : "2px solid transparent",
              marginBottom: -1,
              textDecoration: "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
