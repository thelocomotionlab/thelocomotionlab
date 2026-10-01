// Les DEUX emails du dépôt, via le même relais SMTP que le reste de la stack
// (Brevo, cf. docs/email-setup.md §3), configuré UNIQUEMENT par
// l'environnement (infra/.env) :
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM,
//   TWIN_DEPOT_NOTIFY_EMAIL (destinataire de la notification admin).
// 1) Notification « nouveau dépôt » à Valentin (TWIN_DEPOT_NOTIFY_EMAIL) ;
// 2) Confirmation au déposant (l'adresse du formulaire) — la promesse de
//    l'écran de succès (« je te recontacte à… ») a désormais une trace écrite.
// SMTP_HOST absent → tout est désactivé ; destinataire admin absent → seule la
// notification est désactivée. Un échec d'envoi n'annule JAMAIS le dépôt
// (best-effort, pattern atelier-api).

import nodemailer, { type Transporter } from "nodemailer";

import type { Depot } from "./store";

export interface MailEnv {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export function mailEnv(env: NodeJS.ProcessEnv = process.env): MailEnv | null {
  const host = env.SMTP_HOST ?? "";
  const from = env.SMTP_FROM ?? "";
  if (!host || !from) return null;
  return {
    host,
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER ?? "",
    pass: env.SMTP_PASS ?? "",
    from,
  };
}

export function createTransport(cfg: MailEnv): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

function tailleHumaine(octets: number): string {
  if (octets >= 1048576) return `${(octets / 1048576).toFixed(1).replace(".", ",")} Mo`;
  if (octets >= 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${octets} o`;
}

export async function envoyerNotification(
  transporter: Transporter,
  from: string,
  to: string,
  depot: Depot,
): Promise<void> {
  const texte = [
    `Nouveau dépôt d'archive pour la cohorte Locomotion Twin.`,
    "",
    `Référence : ${depot.reference}`,
    `Athlète   : ${depot.prenom}${depot.nom ? ` ${depot.nom}` : ""} <${depot.email}>`,
    `Montre    : ${depot.montre}`,
    `Archive   : ${depot.nomFichier} (${tailleHumaine(depot.taille)})`,
    `SHA-256   : ${depot.sha256}`,
    `Déposé le : ${depot.createdAt}`,
    "",
    depot.objectifHeures !== null
      ? `Objectif chiffré : ${depot.objectifCible} (${depot.objectifHeures.toFixed(2)} h) — twin-engine --target ${depot.objectifCible}`
      : "(Pas d'objectif chiffré.)",
    depot.objectifs ? `Courses passées / objectif :\n${depot.objectifs}` : "(Pas d'objectifs renseignés.)",
    "",
    `Consentement : version ${depot.consentementVersion ?? "?"}${
      depot.consentementVersion && depot.consentementVersion !== CONSENTEMENT_SUPPRESSION
        ? " (conservation, purge à l'échéance)"
        : " (suppression après analyse)"
    }`,
    "",
    "L'archive est chiffrée sur le volume du dépôt ; le moteur la lit (tableau de bord,",
    "File) et la purge à l'échéance que porte l'athlète.",
  ].join("\n");

  await transporter.sendMail({
    from,
    to,
    subject: `Cohorte Twin — nouveau dépôt de ${depot.prenom} (${depot.montre}, ${tailleHumaine(depot.taille)})`,
    text: texte,
  });
}

/** La version du texte de consentement qui promettait la suppression après analyse. */
export const CONSENTEMENT_SUPPRESSION = "2026-07";

/** Le paragraphe de la confirmation qui dit ce que devient l'archive, selon le texte de
 *  consentement que le déposant a accepté. */
export function paragrapheConservation(depot: Depot, conservationJours: number): string[] {
  if (!depot.consentementVersion || depot.consentementVersion === CONSENTEMENT_SUPPRESSION) {
    return [
      "Conformément à la règle du labo, ton archive est supprimée immédiatement",
      "après analyse — seuls ton rapport et quelques métadonnées sont conservés.",
    ];
  }
  const fin = new Date(Date.parse(depot.createdAt) + conservationJours * 86_400_000);
  const jusquau = fin.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return [
    "Comme tu l'as accepté, ton archive est conservée chiffrée pour développer le",
    `Twin, jusqu'au ${jusquau} ; elle est ensuite supprimée, avec ton jumeau, tes plans`,
    "et ta page. Ce qui reste au registre du labo est anonyme.",
  ];
}

/** Confirmation au déposant — reprend les promesses de l'écran de succès du site
 *  (CohorteForm) : archive bien arrivée, recontact à cette adresse, ce que devient
 *  l'archive selon le consentement accepté. Texte sobre, réponse = SAV. */
export async function envoyerConfirmation(
  transporter: Transporter,
  from: string,
  depot: Depot,
  conservationJours = 183,
): Promise<void> {
  const texte = [
    `Bonjour ${depot.prenom},`,
    "",
    `Ton archive (${depot.nomFichier}, ${tailleHumaine(depot.taille)}) est bien arrivée au labo — merci de ta confiance.`,
    "",
    `Référence du dépôt : ${depot.reference}`,
    "",
    "La suite : tes données servent à calibrer ton jumeau physiologique, et je",
    "te recontacte à cette adresse dès qu'il est prêt, avec ton plan de course",
    "gratuit.",
    "",
    ...paragrapheConservation(depot, conservationJours),
    "",
    "Une question, un détail à ajouter ? Réponds simplement à cet email.",
    "",
    "Valentin — The Locomotion Lab",
  ].join("\n");

  await transporter.sendMail({
    from,
    to: depot.email,
    subject: `Ton archive est bien arrivée — cohorte Locomotion Twin (${depot.reference})`,
    text: texte,
  });
}
