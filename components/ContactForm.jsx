// components/ContactForm.jsx
"use client";

import { useState } from "react";

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [status, setStatus] = useState("idle");

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("sending");

    try {
      const htmlMessage = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <h2 style="color: #EFB159; margin-bottom: 12px;">Nouveau message de contact</h2>
          <p><strong>Nom :</strong> ${formData.name}</p>
          <p><strong>Email :</strong> <a href="mailto:${formData.email}">${formData.email}</a></p>
          <p><strong>Message :</strong></p>
          <div style="border-left: 3px solid #EFB159; padding-left: 10px; margin-top: 6px; color: #555;">
            ${formData.message.replace(/\n/g, "<br/>")}
          </div>
          <hr style="margin-top: 20px; border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 13px; color: #aaa;">
            Ce message a été envoyé depuis le formulaire de contact du site <a href="https://thelocomotionlab.com" style="color:#EFB159; text-decoration:none;">thelocomotionlab.com</a>.
          </p>
        </div>
      `;

      const res = await fetch(
        "https://send-email.thelocomotionlab.workers.dev/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: `Nouveau message de contact – ${formData.name}`,
            message: htmlMessage,
            isHtml: true,
          }),
        }
      );

      if (res.ok) {
        setStatus("success");
        setFormData({ name: "", email: "", message: "" });
      } else {
        console.error("Erreur lors de l’envoi :", await res.text());
        setStatus("error");
      }
    } catch (err) {
      console.error("Erreur réseau :", err);
      setStatus("error");
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-gray-800 font-sans">
      <h1 className="text-3xl font-sans font-bold mb-8 text-brand-primary">
        Contact
      </h1>

      <p className="mb-6">
        Une question, une idée, une envie de collaborer ? Écris-nous via ce
        formulaire ou directement par mail à{" "}
        <a
          href="mailto:thelocomotionlab@gmail.com"
          className="font-semibold text-gray-800 hover:underline"
        >
          thelocomotionlab@gmail.com
        </a>
        .
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Nom
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            aria-required="true"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            aria-required="true"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium mb-1">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows="5"
            value={formData.message}
            onChange={handleChange}
            required
            aria-required="true"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={status === "sending"}
          className={`bg-brand-accent text-white font-semibold px-6 py-2 rounded-full shadow transition cursor-pointer ${
            status === "sending"
              ? "opacity-70 cursor-wait"
              : "hover:bg-brand-primary/90"
          }`}
        >
          {status === "sending" ? "Envoi..." : "Envoyer"}
        </button>

        <div className="h-6 mt-2" aria-live="polite" aria-atomic="true">
          {status === "success" && (
            <p className="text-brand-deep text-sm font-medium animate-fade-in">
              Merci pour ton message, il a bien été envoyé !
            </p>
          )}
          {status === "error" && (
            <p className="text-brand-deep text-sm font-medium animate-fade-in">
              Une erreur est survenue. Réessaie dans un instant.
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
