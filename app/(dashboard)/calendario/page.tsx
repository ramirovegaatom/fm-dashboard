import { fetchUpcomingEvents } from "@/lib/supabase";
import { CalendarioClient } from "./CalendarioClient";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const eventos = await fetchUpcomingEvents();
  return <CalendarioClient eventos={eventos} />;
}
