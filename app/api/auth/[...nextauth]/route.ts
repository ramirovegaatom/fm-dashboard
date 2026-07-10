// Endpoints de Auth.js (login/callback/signout). Los consume el flujo OAuth de Google.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
