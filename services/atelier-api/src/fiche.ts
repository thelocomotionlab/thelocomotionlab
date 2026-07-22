// Fiche d'information et de consentement : validation du payload envoyé par
// la page d'inscription du site, assemblage du payload de rendu (transmis à
// twin-engine POST /fiche), référence de dossier et empreinte SHA-256.
//
// Le CONTENU volatil (consignes de sécurité, questions de santé) arrive du
// site (apps/site/lib/inscriptionContent.mjs = source unique) et repart tel
// quel dans le PDF ; seules les COCHE OBLIGATOIRES sont connues d'ici (des
// booléens stables, pas des textes). L'empreinte scelle les données soumises
// — identique à celle calculée par twin_engine.fiche (même canonisation que
// json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)).

import crypto from "node:crypto";

import type { AtelierDef, Config } from "./config";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FichePayload {
  participant: { prenom: string; nom: string; email: string; telephone: string };
  urgence: { nom: string; telephone: string };
  mineur: { actif: boolean; nom: string; prenom: string; date_naissance: string };
  sante: { attestation: boolean; commentaire_libre: string };
  image: { autorise: boolean };
  consentement: {
    consignes: boolean;
    majeur: boolean;
    exactitude: boolean;
    autorite_parentale: boolean;
    soins_urgence: boolean;
  };
}

export interface ContenuPayload {
  consignes: Array<{ titre: string; texte: string }>;
  consignesMineur: string;
  sante: string[];
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * Valide et normalise la fiche envoyée par le site. Retourne la fiche propre
 * ou la liste des champs manquants/invalides (identifiants stables — le
 * front affiche ses propres messages par bloc).
 */
export function validerFiche(
  raw: unknown,
  contenu: unknown,
): { fiche: FichePayload; contenu: ContenuPayload; champs: string[] } {
  const champs: string[] = [];
  const f = (raw ?? {}) as Record<string, Record<string, unknown>>;
  const participant = {
    prenom: str(f.participant?.prenom, 100),
    nom: str(f.participant?.nom, 100),
    email: str(f.participant?.email, 254),
    telephone: str(f.participant?.telephone, 40),
  };
  if (!participant.prenom) champs.push("participant.prenom");
  if (!participant.nom) champs.push("participant.nom");
  if (!EMAIL_REGEX.test(participant.email)) champs.push("participant.email");
  if (!participant.telephone) champs.push("participant.telephone");

  const urgence = {
    nom: str(f.urgence?.nom, 120),
    telephone: str(f.urgence?.telephone, 40),
  };
  if (!urgence.nom) champs.push("urgence.nom");
  if (!urgence.telephone) champs.push("urgence.telephone");

  const actif = f.mineur?.actif === true;
  const mineur = {
    actif,
    prenom: actif ? str(f.mineur?.prenom, 100) : "",
    nom: actif ? str(f.mineur?.nom, 100) : "",
    date_naissance: actif ? str(f.mineur?.date_naissance, 30) : "",
  };
  if (actif) {
    if (!mineur.prenom) champs.push("mineur.prenom");
    if (!mineur.nom) champs.push("mineur.nom");
    if (!mineur.date_naissance) champs.push("mineur.date_naissance");
  }

  const sante = {
    attestation: f.sante?.attestation === true,
    commentaire_libre: str(f.sante?.commentaire_libre, 1000),
  };
  if (!sante.attestation) champs.push("sante.attestation");

  // Choix EXPLICITE requis (les deux réponses se valent) : un booléen absent
  // ou non booléen = pas de choix.
  if (typeof f.image?.autorise !== "boolean") champs.push("image.autorise");
  const image = { autorise: f.image?.autorise === true };

  const c = (f.consentement ?? {}) as Record<string, unknown>;
  const consentement = {
    consignes: c.consignes === true,
    majeur: !actif && c.majeur === true,
    exactitude: c.exactitude === true,
    autorite_parentale: actif && c.autorite_parentale === true,
    soins_urgence: actif && c.soins_urgence === true,
  };
  if (!consentement.consignes) champs.push("consentement.consignes");
  if (!consentement.exactitude) champs.push("consentement.exactitude");
  if (actif) {
    if (!consentement.autorite_parentale) champs.push("consentement.autorite_parentale");
    if (!consentement.soins_urgence) champs.push("consentement.soins_urgence");
  } else if (!consentement.majeur) {
    champs.push("consentement.majeur");
  }

  // Contenu émis par la page (borné : surface d'abus, pas de la donnée perso).
  const co = (contenu ?? {}) as Record<string, unknown>;
  const consignesListe = (Array.isArray(co.consignes) ? co.consignes : [])
    .slice(0, 30)
    .map((item) => {
      const it = (item ?? {}) as Record<string, unknown>;
      return { titre: str(it.titre, 200), texte: str(it.texte, 600) };
    })
    .filter((it) => it.titre || it.texte);
  if (!consignesListe.length) champs.push("contenu.consignes");
  const santeQuestions = (Array.isArray(co.sante) ? co.sante : [])
    .slice(0, 30)
    .map((q) => str(q, 400))
    .filter(Boolean);
  if (!santeQuestions.length) champs.push("contenu.sante");

  return {
    fiche: { participant, urgence, mineur, sante, image, consentement },
    contenu: {
      consignes: consignesListe,
      consignesMineur: str(co.consignesMineur, 400),
      sante: santeQuestions,
    },
    champs,
  };
}

/** Horodatage lisible, heure de Paris (affiché sur la fiche et à l'écran). */
export function horodatageParis(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "long",
    timeStyle: "medium",
  });
  return fmt.format(date);
}

/** Payload complet transmis au moteur de rendu (twin-engine POST /fiche). */
export function payloadFiche(
  config: Config,
  atelier: AtelierDef,
  fiche: FichePayload,
  contenu: ContenuPayload,
  dossier: { reference: string; horodatage: string; ip: string },
): Record<string, unknown> {
  return {
    participant: fiche.participant,
    urgence: fiche.urgence,
    mineur: fiche.mineur,
    sante: {
      attestation: fiche.sante.attestation,
      commentaire_libre: fiche.sante.commentaire_libre,
      questions: contenu.sante,
    },
    image: {
      autorise: fiche.image.autorise,
      supports: config.fiche.image.supports,
      duree: config.fiche.image.duree,
    },
    consentement: fiche.consentement,
    consignes: { liste: contenu.consignes, mineur: contenu.consignesMineur },
    atelier: {
      intitule: atelier.title,
      date: atelier.dateLabel,
      lieu: atelier.lieu,
      duree: config.fiche.atelier.duree,
      contexte: config.fiche.atelier.contexte,
      encadrant: config.fiche.atelier.encadrant,
    },
    assurance: config.fiche.assurance,
    responsable: config.fiche.responsable,
    dossier: { reference: dossier.reference },
    preuve: { horodatage: dossier.horodatage, ip: dossier.ip },
  };
}

/** Canonisation identique à json.dumps(sort_keys, separators=(",",":"), ensure_ascii=False). */
function canonique(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonique).join(",")}]`;
  const objet = value as Record<string, unknown>;
  const cles = Object.keys(objet).sort();
  return `{${cles.map((k) => `${JSON.stringify(k)}:${canonique(objet[k])}`).join(",")}}`;
}

/** Empreinte SHA-256 des données soumises, hors preuve — identique à
 *  twin_engine.fiche.empreinte (le PDF la porte, le store la garde). */
export function empreinte(payload: Record<string, unknown>): string {
  const scellable = Object.fromEntries(
    Object.entries(payload).filter(([k]) => k !== "preuve"),
  );
  return crypto.createHash("sha256").update(canonique(scellable), "utf8").digest("hex");
}
