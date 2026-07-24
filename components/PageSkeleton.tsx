// Skeleton genérico para los loading.tsx (perf 2026-07-23): el click en un link responde
// al instante con esta placa mientras el server component consulta Supabase. Sin esto la
// navegación se sentía "congelada" (no había ningún feedback hasta que llegaba el SSR).
export function PageSkeleton({ cards = 6, rows = 5 }: { cards?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando…">
      <div className="skeleton" style={{ height: 20, width: 240, marginBottom: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cards, 7)}, 1fr)`, gap: 12, marginBottom: 24 }}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 84 }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 64 }} />
        ))}
      </div>
    </div>
  );
}
