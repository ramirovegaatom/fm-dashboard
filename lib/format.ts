export function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatCurrency(n: number, opts: Intl.NumberFormatOptions = {}) {
  if (!n || n === 0) return "$0";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0, ...opts })}`;
}

export function formatNumber(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}
