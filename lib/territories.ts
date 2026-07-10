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

// Lista canónica de países por territorio, para el desplegable de asignación manual
// (ej: MRR Cerrado, override por deal). Los nombres coinciden con defaultTerritorio.
export const PAISES_POR_TERRITORIO: { territorio: Territorio; paises: string[] }[] = [
  {
    territorio: "Norte",
    paises: [
      "México", "Guatemala", "El Salvador", "Honduras", "Nicaragua",
      "Costa Rica", "Panamá", "República Dominicana", "Cuba", "Estados Unidos",
    ],
  },
  {
    territorio: "Sur",
    paises: [
      "Colombia", "Venezuela", "Ecuador", "Perú", "Bolivia",
      "Chile", "Argentina", "Uruguay", "Paraguay",
    ],
  },
  {
    territorio: "Brasil",
    paises: ["Brasil"],
  },
];
