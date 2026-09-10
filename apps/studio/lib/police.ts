// lib/police.ts
//
// LA FAMILLE DE LA CHARTE, LUE SUR LE DOCUMENT.
//
// Le canvas ne résout aucune variable CSS : `ctx.font = "700 65px var(--…)"` est
// une déclaration invalide, silencieusement ignorée, et le rendu retombe sur la
// police système sans que rien ne le signale. On lit donc la famille RÉSOLUE sur
// le body, où `next/font` l'a posée.
//
// UNE SEULE FAMILLE dans la charte : Ubuntu Sans, en variable 300 → 800. La
// hiérarchie vient de la graisse, de la casse et de l'interlettrage.

const SECOURS = "ui-sans-serif, system-ui, sans-serif";

export function policeDuLabo(): string {
  if (typeof document === "undefined") return SECOURS;
  const resolue = getComputedStyle(document.body).fontFamily;
  return resolue || SECOURS;
}

/**
 * Attend que la fonte soit vraiment chargée.
 *
 * Sans cette attente, la première planche se mesure sur la police de secours :
 * les lignes se coupent ailleurs, et tout se décale une fois Ubuntu arrivée.
 */
export async function policeChargee(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await document.fonts.ready;
  } catch {
    // Une fonte qui n'arrive pas ne doit pas empêcher de dessiner.
  }
}
