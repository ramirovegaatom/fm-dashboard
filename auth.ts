import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// 2026-07-10 (auditoría de seguridad del equipo): el dashboard estaba público.
// Auth con Google restringido al dominio corporativo. Solo cuentas @atomchat.io
// verificadas pueden entrar. Sesión JWT (sin base de datos / adapter).
export const ALLOWED_DOMAIN = "atomchat.io";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // En Vercel el host es de confianza automáticamente; lo dejamos explícito por las dudas.
  trustHost: true,
  providers: [
    Google({
      // `hd` le pide a Google que muestre solo cuentas del dominio (hint de UX).
      // NO es seguridad — la validación real es el callback signIn de abajo.
      authorization: { params: { hd: ALLOWED_DOMAIN, prompt: "select_account" } },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Gate de seguridad server-side: el mail tiene que ser @atomchat.io y estar verificado.
    signIn({ profile }) {
      const email = (profile?.email ?? "").toLowerCase();
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      return email.endsWith(`@${ALLOWED_DOMAIN}`) && verified === true;
    },
  },
});
