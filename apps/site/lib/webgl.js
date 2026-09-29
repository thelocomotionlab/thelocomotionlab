// lib/webgl.js
//
// maplibre-gl lève une exception dès la construction de la carte quand le
// navigateur ne peut pas créer de contexte WebGL (accélération matérielle
// coupée, navigateur durci, pilote graphique refusé). Levée dans un effet
// React sans garde, elle démonte toute la page. On sonde donc le navigateur
// avec les mêmes contextes que maplibre (webgl2, puis webgl) avant de monter
// une carte.

/**
 * Vrai si le canvas donne un contexte WebGL. Le contexte obtenu est rendu
 * aussitôt : un navigateur n'en garde qu'une poignée d'actifs, et la carte
 * va en demander un à son tour.
 */
export function sonderWebgl(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  } catch {
    return false;
  }
  if (!gl) return false;
  gl.getExtension?.("WEBGL_lose_context")?.loseContext();
  return true;
}

let disponible;

/** Sonde le navigateur une seule fois, puis garde la réponse. Côté client uniquement. */
export function webglDisponible() {
  if (disponible === undefined) {
    disponible = sonderWebgl(document.createElement("canvas"));
  }
  return disponible;
}
