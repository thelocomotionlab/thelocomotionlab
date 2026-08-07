// lib/journalMedias.js
//
// La liste des médias PARCOURABLES du journal de bord — celle qu'ouvre la
// visionneuse plein écran.
//
// Elle est extraite ici, hors du composant, pour deux raisons : elle doit
// suivre EXACTEMENT l'ordre d'affichage des entrées (sinon la flèche
// « suivant » saute au mauvais média), et c'est la seule partie de la
// visionneuse qui se teste sans navigateur.

/**
 * @param {Array<{id:string,type:string,text?:string,media?:{url?:string,width?:number,height?:number}}>} entries
 *   — entrées DANS L'ORDRE D'AFFICHAGE (le plus récent d'abord, côté /live).
 * @param {string} mediaBase — domaine qui sert les fichiers (service ou site en replay).
 * @returns {Array<{id:string,type:"photo"|"video",src:string,legende:string,width:number|null,height:number|null}>}
 */
export function mediasDuJournal(entries, mediaBase = "") {
  const out = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (e?.type !== "photo" && e?.type !== "video") continue;
    const url = e.media?.url;
    if (typeof url !== "string" || url === "") continue;
    out.push({
      id: e.id,
      type: e.type,
      src: `${mediaBase}${url}`,
      legende: typeof e.text === "string" ? e.text : "",
      width: Number.isFinite(e.media?.width) ? e.media.width : null,
      height: Number.isFinite(e.media?.height) ? e.media.height : null,
    });
  }
  return out;
}

/** Position d'un média dans la liste, ou -1. Sert à ouvrir sur le bon. */
export function indexDuMedia(medias, id) {
  return (Array.isArray(medias) ? medias : []).findIndex((m) => m.id === id);
}

/**
 * Index suivant/précédent, EN BOUCLE. Arriver au dernier média et ne plus
 * pouvoir avancer donne l'impression que la visionneuse a planté ; on repart
 * donc au premier.
 */
export function indexSuivant(index, delta, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return ((index + delta) % total + total) % total;
}
