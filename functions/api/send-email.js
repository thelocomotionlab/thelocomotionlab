// functions/api/send-email.js
import { createMimeMessage } from "mimetext";

/**
 * Cloudflare Pages Function pour recevoir les emails du formulaire
 * et t’envoyer un mail via ton SMTP (Gmail, ProtonMail, etc.)
 */
export async function onRequestPost(context) {
  try {
    const { email } = await context.request.json();

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Email invalide" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Construire le message MIME
    const msg = createMimeMessage();
    msg.setSender({ name: "Locomotion Lab", addr: context.env.SMTP_USER });
    msg.setRecipient(context.env.SMTP_USER);
    msg.setSubject("Nouvelle inscription - Locomotion Lab");
    msg.addMessage({
      contentType: "text/plain",
      data: `Nouvelle adresse inscrite à la newsletter : ${email}`,
    });

    // Envoyer via SMTP
    const res = await fetch(`https://api.mailchannels.net/tx/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [
          { to: [{ email: context.env.SMTP_USER }] },
        ],
        from: { email: "no-reply@thelocomotionlab.com", name: "Locomotion Lab" },
        subject: "Nouvelle inscription - Locomotion Lab",
        content: [{ type: "text/plain", value: `Nouvelle adresse inscrite : ${email}` }],
      }),
    });

    if (!res.ok) {
      console.error("Erreur MailChannels:", await res.text());
      return new Response(JSON.stringify({ error: "Erreur envoi email" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur serveur:", err);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
