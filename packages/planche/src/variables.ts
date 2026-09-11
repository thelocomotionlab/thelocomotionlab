// packages/planche/src/variables.ts
//
// LES VARIABLES : ce qu'un texte ou un chiffre va chercher dans la séance.
//
// C'est l'avantage du studio sur un outil de mise en page généraliste. On pose
// `{distance}` dans un titre, et la planche affiche 24,3 km ; on change la
// tranche de journées, et le chiffre suit. Rien à recopier, rien à oublier de
// mettre à jour quand la trace change.
//
// LE DERNIER MOT RESTE À L'AUTEUR. `valeurManuelle` d'un élément `stat` écrase
// le calcul : la montre a raison sur son propre fichier, et un total recollé à
// la main n'a pas à être discuté par le studio.
//
// LES CHIFFRES SUIVENT LA TRANCHE de la planche. Sur une planche « jour 3
// seul », `{distance}` est la distance du jour 3, pas celle du tour — c'est ce
// qu'on lit sur une planche d'étape. `{jour_distance}` nomme la journée
// explicitement, quelle que soit la tranche.
//
// PAS D'ESPACE FINE. `Intl` en fr-FR produit U+202F, absent du sous-ensemble
// latin des fontes du dépôt : le canvas dessinerait un carré blanc à la place
// du séparateur de milliers.

import type { PointSeance, Segment, Trace, Seance } from "@locomotionlab/trace";

import type { Bilan, CleVariable, Tranche } from "./types.ts";

const sansFines = (s: string) => String(s).replace(/[\u202F\u00A0\u2009\u2007]/g, " ");
const kmFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const entierFmt = new Intl.NumberFormat("fr-FR");
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** « 24,3 » — un kilométrage, toujours à la décimale. */
export function formatKm(n: number): string {
  return sansFines(kmFmt.format(Number.isFinite(n) ? n : 0));
}

/** « 1 460 » — un entier, séparateur de milliers compris. */
export function formatEntier(n: number): string {
  return sansFines(entierFmt.format(Math.round(Number.isFinite(n) ? n : 0)));
}

/** « 7 h 45 » — la durée telle qu'on la dit, pas telle qu'un chrono l'affiche. */
export function dureeCourte(secondes: number): string {
  const total = Math.max(0, Math.round(secondes / 60));
  const heures = Math.floor(total / 60);
  const minutes = total % 60;
  return heures > 0 ? `${heures} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
}

/** « 5'20" » — une allure, en minutes et secondes au kilomètre. */
export function formatAllure(secondesParKm: number): string {
  if (!Number.isFinite(secondesParKm) || secondesParKm <= 0) return "";
  const total = Math.round(secondesParKm);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, "0")}"`;
}

/** « 11,3 » — une vitesse en km/h. */
export function formatVitesse(metresParSeconde: number): string {
  return formatKm((metresParSeconde * 3600) / 1000);
}

/** « 14 juin 2026 ». */
export function formatDate(ms: number): string {
  return sansFines(dateFmt.format(new Date(ms)));
}

/* ------------------------------------------------------------- le catalogue */

export type FicheVariable = {
  cle: CleVariable;
  /** Le libellé du sélecteur de variable. */
  label: string;
  /** L'unité qu'on écrit à côté du chiffre, quand il y en a une. */
  unite: string;
  /** Cette variable exige-t-elle une séance horodatée ? */
  exigeSeance: boolean;
};

export const VARIABLES: FicheVariable[] = [
  { cle: "distance", label: "Distance", unite: "km", exigeSeance: false },
  { cle: "dplus", label: "Dénivelé positif", unite: "m", exigeSeance: false },
  { cle: "dmoins", label: "Dénivelé négatif", unite: "m", exigeSeance: false },
  { cle: "duree", label: "Durée", unite: "", exigeSeance: false },
  { cle: "allure", label: "Allure", unite: "/km", exigeSeance: true },
  { cle: "vitesse", label: "Vitesse", unite: "km/h", exigeSeance: true },
  { cle: "fc_moy", label: "FC moyenne", unite: "bpm", exigeSeance: true },
  { cle: "fc_max", label: "FC maximale", unite: "bpm", exigeSeance: true },
  { cle: "fc", label: "FC à l'instant", unite: "bpm", exigeSeance: true },
  { cle: "altitude", label: "Altitude à l'instant", unite: "m", exigeSeance: true },
  { cle: "cadence", label: "Cadence", unite: "spm", exigeSeance: true },
  { cle: "alt_max", label: "Altitude maximale", unite: "m", exigeSeance: false },
  { cle: "jour", label: "Numéro de journée", unite: "", exigeSeance: false },
  { cle: "jour_distance", label: "Distance de la journée", unite: "km", exigeSeance: false },
  { cle: "jour_dplus", label: "D+ de la journée", unite: "m", exigeSeance: false },
  { cle: "planche", label: "Numéro de planche", unite: "", exigeSeance: false },
  { cle: "planches", label: "Nombre de planches", unite: "", exigeSeance: false },
  { cle: "nom", label: "Nom de la sortie", unite: "", exigeSeance: false },
  { cle: "date", label: "Date", unite: "", exigeSeance: false },
];

const PAR_CLE = new Map(VARIABLES.map((v) => [v.cle, v]));

/**
 * Les clés se comparent SANS ACCENT ni casse.
 *
 * La spécification écrit `{durée}`, et c'est ce qu'un auteur tape ; la clé
 * canonique, elle, reste `duree`. Même tolérance que le filtre d'icônes.
 */
function normaliser(cle: string): string {
  return cle
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "");
}

const PAR_NOM = new Map(VARIABLES.map((v) => [normaliser(v.cle), v.cle]));

/** La clé canonique d'un nom saisi, ou `null` si personne ne le connaît. */
export function cleDe(nom: string): CleVariable | null {
  return PAR_NOM.get(normaliser(nom)) ?? null;
}

export function ficheDe(cle: CleVariable): FicheVariable | null {
  return PAR_CLE.get(cle) ?? null;
}

/* ------------------------------------------------------------- le contexte */

export type Contexte = {
  trace: Trace | null;
  seance: Seance | null;
  /** Les journées découpées, dans l'ordre. */
  segments: Segment[];
  /** La tranche de la planche : les chiffres la suivent. */
  tranche: Tranche;
  bilan: Bilan;
  /** Le nom du projet, en dernier recours pour `{nom}`. */
  nomProjet: string;
  /**
   * LA PAGINATION EST UNE DONNÉE DU DOCUMENT, pas de la séance.
   *
   * « 03 / 12 » compte des PLANCHES, et n'a rien à voir avec les journées d'une
   * trace. Les confondre donnait un pied qui affichait le numéro du jour, ou
   * rien du tout sur un carrousel sans trace.
   */
  planche?: number;
  planches?: number;
  /**
   * LE POINT DE LA SÉANCE QU'ON REGARDE, sur un survol.
   *
   * C'est lui qui fait défiler les chiffres pendant que le point avance : la
   * distance monte, l'allure change dans la pente, le cœur bat. Absent, les
   * variables disent la sortie entière — ce qu'attend une planche fixe.
   */
  instant?: PointSeance | null;
};

/** Les journées que la tranche montre. Vide = il n'y a pas de découpage. */
export function segmentsDeLaTranche(segments: Segment[], tranche: Tranche): Segment[] {
  if (segments.length === 0) return [];
  const jour = Math.max(0, Math.min(segments.length - 1, Math.round(tranche.jour)));
  if (tranche.mode === "seule") return [segments[jour]!];
  if (tranche.mode === "jusqua") return segments.slice(0, jour + 1);
  return segments;
}

/**
 * Ce qu'une variable vaut À UN POINT de la séance.
 *
 * `undefined` — et non `null` — pour « cette variable n'a pas d'instant » : il
 * faut distinguer « le cœur ne bat pas ici » (null, on affiche un tiret) de
 * « la date n'est pas une affaire d'instant » (on continue plus bas).
 */
function valeurAInstant(cle: CleVariable, p: PointSeance): string | null | undefined {
  switch (cle) {
    case "distance":
      return formatKm(p.dist / 1000);
    case "dplus":
      return formatEntier(p.dPlus);
    case "duree":
      return dureeCourte(p.t);
    case "allure":
      return p.allure === null ? ABSENT : formatAllure(p.allure);
    case "vitesse":
      return formatKm(p.vitesse * 3.6);
    case "cadence":
      return p.cadence === null ? ABSENT : formatEntier(p.cadence);
    case "fc":
      return p.fc === null ? ABSENT : formatEntier(p.fc);
    case "altitude":
      return formatEntier(p.alt);
    default:
      return undefined;
  }
}

/**
 * La valeur d'une variable, formatée et prête à poser.
 *
 * `null` quand la donnée manque : pas de séance pour une allure, pas de trace
 * pour une distance. L'inspecteur s'en sert pour dire « cette variable n'a rien
 * à afficher » plutôt que de laisser un blanc inexpliqué dans l'image.
 */
export function valeurDe(cle: CleVariable, ctx: Contexte): string | null {
  const { trace, seance, tranche } = ctx;

  // L'INSTANT PASSE AVANT TOUT. Sur un survol, « distance » est le chemin
  // parcouru jusqu'ici, pas le total de la sortie — c'est ce défilement qui
  // fait la vidéo. Les autres variables (le nom, la date, les journées)
  // n'ont pas d'instant et suivent leur route habituelle.
  if (ctx.instant) {
    const v = valeurAInstant(cle, ctx.instant);
    if (v !== undefined) return v;
  }
  const montres = segmentsDeLaTranche(ctx.segments, tranche);
  const jour = Math.max(0, Math.min(Math.max(0, ctx.segments.length - 1), Math.round(tranche.jour)));
  const duJour = ctx.segments[jour] ?? null;

  // L'ORDRE : les journées montrées, puis la trace, puis la séance. Une
  // planche d'étape parle de son jour ; sans découpage, du tour ; et si le
  // projet n'a qu'une séance — un GPX chargé pour un survol —, c'est elle qui
  // porte les chiffres. La durée lisait déjà la séance ; la distance et le
  // dénivelé l'ignoraient, ce qui laissait un blanc là où le nombre existait.
  const sommeKm = montres.length
    ? montres.reduce((s, x) => s + x.distanceKm, 0)
    : (trace?.totalKm ?? seance?.resume.distanceKm ?? null);
  const sommeDPlus = montres.length
    ? montres.reduce((s, x) => s + x.dPlusM, 0)
    : (trace?.dPlusM ?? seance?.resume.dPlusM ?? null);
  const sommeDMoins = montres.length
    ? montres.reduce((s, x) => s + x.dMinusM, 0)
    : (trace?.dMinusM ?? seance?.resume.dMinusM ?? null);

  switch (cle) {
    case "distance":
      return sommeKm === null ? null : formatKm(sommeKm);
    case "dplus":
      return sommeDPlus === null ? null : formatEntier(sommeDPlus);
    case "dmoins":
      return sommeDMoins === null ? null : formatEntier(sommeDMoins);
    case "duree": {
      // Pas de durée par journée : une trace kilométrique ne porte aucun
      // horaire de coupure, et un temps d'étape inventé serait pire que rien.
      const s = seance?.resume.dureeSecondes ?? trace?.dureeSecondes ?? null;
      return s === null ? null : dureeCourte(s);
    }
    case "allure": {
      const a = seance?.resume.allureMoyenne ?? null;
      return a === null ? null : formatAllure(a);
    }
    case "vitesse": {
      const v = seance?.resume.vitesseMoyenne ?? null;
      return v === null ? null : formatVitesse(v);
    }
    case "fc_moy":
      return seance?.resume.fcMoyenne == null ? null : String(seance.resume.fcMoyenne);
    case "fc_max":
      return seance?.resume.fcMax == null ? null : String(seance.resume.fcMax);
    // Sans instant, ces deux-là n'ont rien à dire : une planche fixe montre une
    // sortie entière, où « le cœur bat à 137 » ne veut rien dire. L'inspecteur
    // le signale plutôt que de laisser un blanc.
    case "fc":
    case "altitude":
      return null;
    case "cadence":
      return seance?.resume.cadenceMoyenne == null ? null : String(seance.resume.cadenceMoyenne);
    case "alt_max": {
      const parSeance = seance?.resume.altMaxM ?? null;
      if (parSeance !== null) return formatEntier(parSeance);
      const alts = montres.flatMap((s) => (s.altMax === null ? [] : [s.altMax]));
      if (alts.length > 0) return formatEntier(Math.max(...alts));
      const profil = trace?.profil ?? [];
      return profil.length ? formatEntier(Math.max(...profil.map((p) => p.alt))) : null;
    }
    case "planche":
      return ctx.planche === undefined ? null : String(ctx.planche + 1).padStart(2, "0");
    case "planches":
      return ctx.planches === undefined ? null : String(ctx.planches).padStart(2, "0");
    case "jour":
      return ctx.segments.length ? String(jour + 1) : null;
    case "jour_distance":
      return duJour === null ? null : formatKm(duJour.distanceKm);
    case "jour_dplus":
      return duJour === null ? null : formatEntier(duJour.dPlusM);
    case "nom":
      return trace?.nom ?? seance?.nom ?? ctx.nomProjet ?? null;
    case "date": {
      const ms = seance?.resume.debutMs ?? null;
      return ms === null ? null : formatDate(ms);
    }
    default:
      return null;
  }
}

/** Ce que porte un `{…}` non résolu. Un blanc silencieux passerait inaperçu. */
export const ABSENT = "—";

const MOTIF = /\{([^{}]{1,40})\}/g;

/**
 * Remplace les `{variable}` d'un texte.
 *
 * Un `{mot}` qui ne nomme aucune variable est laissé TEL QUEL : c'est le seul
 * moyen d'écrire une accolade dans un titre sans que le studio la mange.
 */
export function resoudre(texte: string, ctx: Contexte, absent: string = ABSENT): string {
  return String(texte ?? "").replace(MOTIF, (entier, nom: string) => {
    const cle = cleDe(nom);
    if (cle === null) return entier;
    return valeurDe(cle, ctx) ?? absent;
  });
}

/** Les variables citées par un texte, dans l'ordre d'apparition, sans doublon. */
export function variablesCitees(texte: string): CleVariable[] {
  const out: CleVariable[] = [];
  for (const m of String(texte ?? "").matchAll(MOTIF)) {
    const cle = cleDe(m[1]!);
    if (cle !== null && !out.includes(cle)) out.push(cle);
  }
  return out;
}
