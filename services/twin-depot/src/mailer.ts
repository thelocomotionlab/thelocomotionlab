// Notification « nouveau dépôt » à Valentin, via le même relais SMTP que le
// reste de la stack (Brevo, cf. docs/email-setup.md §3), configuré UNIQUEMENT
// par l'environnement (infra/.env) :
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM,
//   TWIN_DEPOT_NOTIFY_EMAIL (destinataire).
// SMTP_HOST ou destinataire absent → notification désactivée ; son échec
// n'annule JAMAIS le dépôt (best-effort, pattern atelier-api).

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
    depot.objectifs ? `Courses passées / objectif :\n${depot.objectifs}` : "(Pas d'objectifs renseignés.)",
    "",
    "Récupération : GET /twin/depots (listing) puis /twin/depots/<id>/archive",
    "avec le Bearer TWIN_DEPOT_ADMIN_TOKEN — et DELETE /twin/depots/<id> une",
    "fois l'analyse terminée (règle du labo : purge immédiate après analyse).",
  ].join("\n");

  await transporter.sendMail({
    from,
    to,
    subject: `Cohorte Twin — nouveau dépôt de ${depot.prenom} (${depot.montre}, ${tailleHumaine(depot.taille)})`,
    text: texte,
  });
}
