"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Principal" },
  { href: "/partners", label: "Partners" },
  { href: "/pauta", label: "Pauta" },
  { href: "/mrr", label: "MRR cerrado" },
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
