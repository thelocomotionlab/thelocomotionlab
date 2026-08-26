// services/tracking-cache/src/fenetre.ts
//
// « Ce point est-il dans la fenêtre de collecte ? »
//
// La comparaison se faisait de CHAÎNE À CHAÎNE (`p.fixTime >= windowStartIso`),
// et ça se tient tant que les deux côtés s'écrivent pareil. Or ils ne s'écrivent
// PAS pareil : la fenêtre est posée par `new Date().toISOString()` — qui finit
// par « Z » — tandis que Traccar rend « …+00:00 » (relevé sur le Tour des
// Écrins : `2026-08-23T11:11:13.000+00:00`). Sur deux instants identiques, la
// comparaison tombe alors sur '+' (0x2B) contre 'Z' (0x5A) et déclare le point
// ANTÉRIEUR : le tout premier point de l'aventure — celui posé à la seconde du
// `./track start` — était jeté. Et un décalage horaire explicite (« +02:00 »)
// mettrait l'ordre lexicographique franchement en défaut.
//
// On compare donc des INSTANTS. Un horodatage illisible n'entre pas dans la
// fenêtre : mieux vaut perdre un point douteux que polluer la trace.

export function dansLaFenetre(fixTime: string | null | undefined, depuis: string | null): boolean {
  if (!depuis) return true;
  if (!fixTime) return false;
  const t = Date.parse(fixTime);
  const t0 = Date.parse(depuis);
  if (!Number.isFinite(t)) return false;
  if (!Number.isFinite(t0)) return true;
  return t >= t0;
}
