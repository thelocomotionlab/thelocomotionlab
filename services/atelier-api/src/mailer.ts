// Envoi de l'email récapitulatif (PDF de la fiche en pièce jointe) via SMTP —
// le relais est celui de la liste email (Brevo, cf. docs/email-setup.md §3),
// configuré UNIQUEMENT par l'environnement (infra/.env) :
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM.
// SMTP_HOST absent → envoi désactivé, l'inscription reste fonctionnelle.

import nodemailer, { type Transporter } from "nodemailer";

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

export interface FicheMail {
  to: string;
  prenom: string;
  atelier: { title: string; dateLabel: string; lieu: string };
  reference: string;
  pdf: Buffer | null;
}

export async function envoyerFiche(
  transporter: Transporter,
  from: string,
  mail: FicheMail,
): Promise<void> {
  const { atelier } = mail;
  const texte = [
    `Bonjour ${mail.prenom},`,
    "",
    `Ta place est réservée pour « ${atelier.title} » — ${atelier.dateLabel}, ${atelier.lieu}.`,
    "",
    mail.pdf
      ? "En pièce jointe : la copie fidèle (PDF) de la fiche d'information et de consentement que tu viens de valider."
      : "La copie PDF de ta fiche d'information et de consentement suivra dans un second email.",
    `Référence du dossier : ${mail.reference}.`,
    "",
    "Pour annuler ta place, réponds simplement à cet email.",
    "",
    "À très vite sur le terrain,",
    "Valentin — The Locomotion Lab",
  ].join("\n");

  await transporter.sendMail({
    from,
    to: mail.to,
    subject: `Ta place est réservée — ${atelier.title}`,
    text: texte,
    attachments: mail.pdf
      ? [
          {
            filename: `fiche-${mail.reference}.pdf`,
            content: mail.pdf,
            contentType: "application/pdf",
          },
        ]
      : [],
  });
}
