import { fetchUpcomingEvents, fetchEventAccionables, fetchEventPrep } from "@/lib/supabase";
import { CalendarioClient } from "./CalendarioClient";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const [eventos, accionables, prep] = await Promise.all([
    fetchUpcomingEvents(),
    fetchEventAccionables(),
    fetchEventPrep(),
  ]);
  return <CalendarioClient eventos={eventos} accionables={accionables} prep={prep} />;
}
