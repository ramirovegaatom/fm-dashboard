export type Territorio = "Norte" | "Sur" | "Brasil";

export const TERRITORIOS: Territorio[] = ["Norte", "Sur", "Brasil"];

const NORTE = new Set([
  "México", "Mexico",
  "Guatemala",
  "El Salvador",
  "Honduras",
  "Nicaragua",
  "Costa Rica",
  "Panamá", "Panama",
  "República Dominicana", "Republica Dominicana",
  "Cuba",
  "Estados Unidos", "USA", "United States",
]);

const SUR = new Set([
  "Colombia",
  "Venezuela",
  "Ecuador",
  "Perú", "Peru",
  "Bolivia",
  "Chile",
  "Argentina",
  "Uruguay",
  "Paraguay",
]);

const BRASIL = new Set(["Brasil", "Brazil"]);

export function defaultTerritorio(pais: string | null | undefined): Territorio | null {
  if (!pais) return null;
  if (BRASIL.has(pais)) return "Brasil";
  if (NORTE.has(pais)) return "Norte";
  if (SUR.has(pais)) return "Sur";
  return null;
}
