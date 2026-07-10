import { auth } from "@/auth";

// Next 16 renombró `middleware.ts` → `proxy.ts` (corre en Node.js runtime).
// Protege TODO el dashboard: sin sesión → redirect a /login; las API responden 401.
// El matcher excluye /api/auth (flujo OAuth de Auth.js) y los estáticos.
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Ya autenticado: si está en /login, mandarlo al inicio; si no, seguir.
  if (req.auth) {
    if (pathname === "/login") {
      return Response.redirect(new URL("/", req.nextUrl.origin));
    }
    return;
  }

  // Sin sesión: el login tiene que ser accesible.
  if (pathname === "/login") return;

  // API sin sesión → 401 (no redirect, para que el fetch reciba un error claro).
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  // Resto de las páginas sin sesión → al login.
  return Response.redirect(new URL("/login", req.nextUrl.origin));
});

export const config = {
  // Corre en todo menos: rutas de Auth.js, estáticos de Next, imágenes y favicon.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
