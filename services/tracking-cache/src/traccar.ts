// services/tracking-cache/src/traccar.ts
//
// Accès à l'API Traccar (/positions). Le token (Bearer) vient de la config
// (env). Par défaut on tape Traccar EN LOCAL (host.docker.internal:8082/api) :
// pas d'aller-retour public, et le token reste côté serveur.

import type { Config } from "./config";
import type { TraccarPosition } from "./types";

export async function fetchPositions(
  config: Config,
  fromIso: string,
  toIso: string
): Promise<TraccarPosition[]> {
  const url =
    `${config.apiUrl.replace(/\/$/, "")}/positions` +
    `?deviceId=${config.deviceId}` +
    `&from=${encodeURIComponent(fromIso)}` +
    `&to=${encodeURIComponent(toIso)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Réponse invalide de Traccar : HTTP ${res.status} ${res.statusText} - ${txt}`);
  }

  const data = (await res.json()) as TraccarPosition[];
  return data
    .slice(0, config.maxPointsPerFetch)
    .sort((a, b) => new Date(a.fixTime ?? 0).getTime() - new Date(b.fixTime ?? 0).getTime());
}
