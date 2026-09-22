// Prévenir le moteur qu'un dépôt vient d'arriver.
//
// Sans cet appel, rien ne dirait au moteur qu'une archive l'attend — et la seule
// alternative serait un sondage périodique, c'est-à-dire une requête toutes les N
// minutes pour apprendre, la plupart du temps, qu'il ne s'est rien passé.
//
// L'appel voyage sur le RÉSEAU DOCKER, sur un chemin que Caddy ne route pas
// (`/twin/internal/*`). Le secret partagé ne garde donc pas contre l'internet : il garde
// contre un autre conteneur de la stack. Il ne porte que l'id du dépôt — le moteur relit
// tout le reste par la route admin, pour n'avoir rien à croire sur parole.
//
// Best-effort, comme les emails : un moteur injoignable n'annule JAMAIS un dépôt. L'échec
// est noté sur le dépôt, et la File du tableau de bord a un bouton « rafraîchir » qui
// rattrape ce qui manque.

const ESSAIS = 3;
const ATTENTE_MS = [500, 2000];
const DELAI_MS = 10_000;

export interface MoteurEnv {
  url: string;
  secret: string;
}

export function moteurEnv(env: NodeJS.ProcessEnv = process.env): MoteurEnv | null {
  const url = env.TWIN_ENGINE_URL ?? "http://twin-engine:8000";
  const secret = env.TWIN_INTERNAL_SECRET ?? "";
  if (!url || !secret) return null;
  return { url: url.replace(/\/+$/, ""), secret };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Prévient le moteur, avec trois essais. Rend `true` si l'un d'eux a abouti.
 *
 * Un 4xx n'est pas réessayé : un secret refusé ou un dépôt introuvable le sera tout
 * autant dans deux secondes, et insister ne ferait que retarder la réponse au déposant.
 */
export async function prevenirLeMoteur(
  cfg: MoteurEnv,
  depotId: string,
  journal?: { error: (o: unknown, m: string) => void },
): Promise<boolean> {
  for (let essai = 0; essai < ESSAIS; essai += 1) {
    try {
      const res = await fetch(`${cfg.url}/twin/internal/deposits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depot_id: depotId, secret: cfg.secret }),
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500) {
        journal?.error({ status: res.status, depotId }, "moteur : appel refusé, pas de reprise");
        return false;
      }
      journal?.error({ status: res.status, depotId, essai }, "moteur : réponse en erreur");
    } catch (err) {
      journal?.error({ err, depotId, essai }, "moteur injoignable");
    }
    if (essai < ESSAIS - 1) await dormir(ATTENTE_MS[essai] ?? 2000);
  }
  return false;
}
