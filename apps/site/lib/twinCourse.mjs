// lib/twinCourse.mjs
//
// LES RÈGLES DE L'ÉDITEUR DE COURSE, sans l'écran.
//
// Une course se décrit par ses ravitaillements — le départ au km 0, l'arrivée en dernier,
// et ce qu'il y a entre les deux — et par des phases qui commencent toujours sur un
// ravitaillement. Ce module tient ces règles ; l'éditeur ne fait que les appeler, et ce
// qu'il enregistre se traduit donc toujours en carnet de route pour le moteur.

/** Deux kilomètres à moins de cent mètres l'un de l'autre sont le même point de passage. */
export const MEME_POINT_KM = 0.1;

const arrondi = (km) => Math.round(Number(km) * 100) / 100;

/** Les ravitaillements triés par kilomètre, et numérotés dans cet ordre. */
export function trier(ravitaillements) {
  return [...ravitaillements]
    .map((r) => ({ ...r, km: arrondi(r.km) }))
    .sort((a, b) => a.km - b.km)
    .map((r, index) => ({ ...r, index }));
}

/** Range la liste et rend l'index qu'y occupe l'élément marqué `_suivi`. */
function rangerEnSuivant(liste) {
  const rangee = trier(liste);
  const index = rangee.findIndex((r) => r._suivi);
  return { liste: rangee.map(({ _suivi, ...r }) => r), index };
}

/** Un ravitaillement neuf à ce kilomètre. Il se range à sa place ; rend la liste et
 *  l'index qu'il y occupe. */
export function poser(ravitaillements, km, nom = "") {
  const neuf = {
    nom: nom || `Ravitaillement km ${String(arrondi(km)).replace(".", ",")}`,
    km: arrondi(km),
    base_majeure: false,
    assistance: false,
    arret_min: null,
    _suivi: true,
  };
  return rangerEnSuivant([...ravitaillements, neuf]);
}

/** Le départ et l'arrivée tiennent le parcours : ils ne se suppriment pas. */
export function estUneExtremite(ravitaillements, index) {
  return index === 0 || index === ravitaillements.length - 1;
}

/** Retire un ravitaillement ; rend la liste et ce qu'il faut pour le remettre. */
export function retirer(ravitaillements, index) {
  if (estUneExtremite(ravitaillements, index)) return { liste: ravitaillements, retire: null };
  const retire = ravitaillements[index];
  return { liste: trier(ravitaillements.filter((_, i) => i !== index)), retire };
}

/** Déplace un ravitaillement. Le départ reste au km 0 : c'est la définition d'un départ. */
export function deplacer(ravitaillements, index, km) {
  if (index === 0) return { liste: ravitaillements, index: 0 };
  return rangerEnSuivant(
    ravitaillements.map((r, i) =>
      i === index ? { ...r, km: Math.max(0.01, arrondi(km)), _suivi: true } : r,
    ),
  );
}

/** Remet un ravitaillement retiré, à son kilomètre. */
export function remettre(ravitaillements, retire) {
  return rangerEnSuivant([...ravitaillements, { ...retire, _suivi: true }]);
}

// Une mention en fin de nom, entre parenthèses ou crochets : « Isola (assistance) »,
// « Venanson [base, assistance] ».
const MENTION = /\s*[([]([^)\]]*)[)\]]\s*$/;
const sansAccents = (texte) => texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Le nom d'un waypoint et ce qu'il déclare. « Isola (assistance) » devient le
 * ravitaillement « Isola », ouvert à l'assistance ; « (base) » en fait une base majeure.
 * Une parenthèse qui ne dit ni l'un ni l'autre fait partie du nom et reste.
 */
export function lireLeWaypoint(nom) {
  const brut = String(nom ?? "").trim();
  const mention = MENTION.exec(brut);
  const mots = mention ? sansAccents(mention[1]) : "";
  const assistance = /assist|crew/.test(mots);
  const base = /\bbase/.test(mots);
  return {
    nom: assistance || base ? brut.slice(0, mention.index).trim() : brut,
    assistance,
    base_majeure: base,
  };
}

// Les noms que l'éditeur pose de lui-même : un waypoint nommé les remplace.
const NOM_PAR_DEFAUT = /^Ravitaillement( km [\d,.]+)?$/;

/**
 * Les waypoints du GPX versés dans ce qui est déjà posé.
 *
 * Un waypoint qui tombe sur un ravitaillement existant (à moins de cent mètres) ne le
 * double pas : c'est le même point. Il le complète — l'assistance ou la base qu'il
 * déclare, son nom quand l'existant n'a que celui que l'éditeur lui avait donné — sans
 * rien retirer de ce qui a été saisi. Rend la liste et le bilan, que l'écran annonce.
 */
export function importerLesWaypoints(ravitaillements, waypoints, distanceKm) {
  const liste = ravitaillements.map((r) => ({ ...r }));
  const bilan = { lus: 0, ajoutes: 0, completes: 0, deja: 0, assistance: 0 };
  const proche = (km) => liste.find((r) => Math.abs(r.km - km) < MEME_POINT_KM);
  if (!proche(0)) liste.push({ nom: "Départ", km: 0, base_majeure: false, assistance: false, arret_min: null });
  for (const w of waypoints ?? []) {
    if (w.km === null || w.km === undefined) continue;
    bilan.lus += 1;
    const lu = lireLeWaypoint(w.nom);
    if (lu.assistance) bilan.assistance += 1;
    const existant = proche(w.km);
    if (!existant) {
      liste.push({
        nom: lu.nom || "Ravitaillement",
        km: w.km,
        base_majeure: lu.base_majeure,
        assistance: lu.assistance,
        arret_min: null,
      });
      bilan.ajoutes += 1;
      continue;
    }
    const avant = JSON.stringify(existant);
    if (lu.assistance) existant.assistance = true;
    if (lu.base_majeure) existant.base_majeure = true;
    // Un nom par défaut, ou le même nom encore porteur de sa mention (un import
    // d'avant la lecture des mentions), prend le nom propre du waypoint.
    if (lu.nom && (NOM_PAR_DEFAUT.test(existant.nom ?? "") || lireLeWaypoint(existant.nom).nom === lu.nom)) {
      existant.nom = lu.nom;
    }
    if (JSON.stringify(existant) === avant) bilan.deja += 1;
    else bilan.completes += 1;
  }
  if (distanceKm && !proche(distanceKm) && liste.every((r) => r.km < distanceKm - MEME_POINT_KM)) {
    liste.push({ nom: "Arrivée", km: distanceKm, base_majeure: false, assistance: false, arret_min: null });
  }
  return { liste: trier(liste), bilan };
}

const compte = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

/** Ce que l'import a fait, en une phrase. */
export function direLImport(bilan) {
  if (!bilan.lus) return "La trace ne porte aucun waypoint placé sur le parcours.";
  const lus = compte(bilan.lus, "waypoint lu", "waypoints lus");
  if (!bilan.ajoutes && !bilan.completes) return `${lus} : tous déjà posés, rien à changer.`;
  const parts = [
    bilan.ajoutes ? compte(bilan.ajoutes, "ajouté", "ajoutés") : "",
    bilan.completes ? compte(bilan.completes, "complété", "complétés") : "",
    bilan.deja ? compte(bilan.deja, "déjà posé", "déjà posés") : "",
  ].filter(Boolean);
  const assistance = bilan.assistance ? ` — ${compte(bilan.assistance, "marqué", "marqués")} assistance` : "";
  return `${lus} : ${parts.join(", ")}${assistance}.`;
}

/** Ce que la liste dit en une ligne : combien, combien ouverts à l'assistance, combien de bases.
 *  Le départ ne se compte pas : l'athlète ne le croise pas, il en part. */
export function resume(ravitaillements) {
  return {
    poses: ravitaillements.filter((r) => r.km > 0).length,
    assistance: ravitaillements.filter((r) => r.assistance).length,
    bases: ravitaillements.filter((r) => r.base_majeure).length,
  };
}

/**
 * Les phases, rangées et bornées comme le moteur les lit : une phase commence sur un
 * ravitaillement et court jusqu'au début de la suivante — la dernière jusqu'à l'arrivée.
 * `au_km` se DÉDUIT : le laisser saisir ferait croire à une frontière que le rapport
 * n'imprimerait pas.
 */
export function bornerLesPhases(phases, kms) {
  const fin = kms.length ? kms[kms.length - 1] : 0;
  const triees = [...phases].sort((a, b) => a.du_km - b.du_km);
  return triees.map((p, i) => ({ ...p, au_km: i + 1 < triees.length ? triees[i + 1].du_km : fin }));
}

/** Le ravitaillement le plus proche d'un kilomètre — l'aimant des phases. */
export function aimanter(km, kms) {
  let meilleur = kms[0] ?? 0;
  for (const k of kms) if (Math.abs(k - km) < Math.abs(meilleur - km)) meilleur = k;
  return meilleur;
}

/** Pose une phase sur un intervalle glissé : elle commence au ravitaillement le plus
 *  proche du début. Rend `null` si une phase commence déjà là. */
export function poserUnePhase(phases, du, kms, nom = "") {
  const debut = aimanter(du, kms);
  if (debut >= kms[kms.length - 1] || phases.some((p) => p.du_km === debut)) return null;
  return bornerLesPhases([...phases, { nom: nom || `Phase ${phases.length + 1}`, du_km: debut, au_km: debut, note: "" }], kms);
}

// --------------------------------------------------------------------------- //
// Le départ : une date, une heure, un fuseau
// --------------------------------------------------------------------------- //

/** Les fuseaux proposés, en décalages horaires : c'est ce que le moteur lit. */
export const FUSEAUX = [
  "-10:00", "-08:00", "-07:00", "-06:00", "-05:00", "-04:00", "-03:00", "+00:00",
  "+01:00", "+02:00", "+03:00", "+04:00", "+05:30", "+07:00", "+08:00", "+09:00",
  "+10:00", "+12:00",
];

/** « 2026-09-25T13:00:00+02:00 » → { date, heure, fuseau }. Les champs vides restent vides. */
export function decomposerLeDepart(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(
    String(iso || ""),
  );
  if (!m) return { date: "", heure: "", fuseau: "+02:00" };
  return { date: m[1], heure: m[2] || "", fuseau: m[3] === "Z" ? "+00:00" : m[3] || "+02:00" };
}

/** { date, heure, fuseau } → ISO avec son décalage. Sans date, pas de départ. */
export function composerLeDepart({ date, heure, fuseau }) {
  if (!date) return "";
  return `${date}T${heure || "00:00"}:00${fuseau || "+00:00"}`;
}
