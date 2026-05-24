// components/ContactForm.jsx
"use client";

import { useState } from "react";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(formData) {
  const errors = {};
  if (!formData.name.trim()) errors.name = "Le nom est requis.";
  if (!formData.email.trim()) {
    errors.email = "L’email est requis.";
  } else if (!EMAIL_REGEX.test(formData.email.trim())) {
    errors.email = "Format d’email invalide.";
  }
  if (!formData.message.trim()) errors.message = "Le message est requis.";
  return errors;
}

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [status, setStatus] = useState("idle");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (touched[name]) {
      setErrors(validate({ ...formData, [name]: value }));
    }
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors(validate(formData));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validate(formData);
    setErrors(validationErrors);
    setTouched({ name: true, email: true, message: true });
    if (Object.keys(validationErrors).length > 0) {
      setStatus("invalid");
      return;
    }

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
        setErrors({});
        setTouched({});
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
    <div className="max-w-2xl mx-auto px-6 py-12 text-gray-800 font-sans">
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

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
            onBlur={handleBlur}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={errors.name ? "name-error" : undefined}
            className={`w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
              errors.name ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.name && (
            <p id="name-error" className="text-red-700 text-sm mt-1">
              {errors.name}
            </p>
          )}
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
            onBlur={handleBlur}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.email) || undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={`w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
              errors.email ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.email && (
            <p id="email-error" className="text-red-700 text-sm mt-1">
              {errors.email}
            </p>
          )}
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
            onBlur={handleBlur}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.message) || undefined}
            aria-describedby={errors.message ? "message-error" : undefined}
            className={`w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
              errors.message ? "border-red-500" : "border-gray-300"
            }`}
          ></textarea>
          {errors.message && (
            <p id="message-error" className="text-red-700 text-sm mt-1">
              {errors.message}
            </p>
          )}
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

        <div className="mt-2" aria-live="polite" aria-atomic="true" role="status">
          {status === "success" && (
            <p className="text-green-700 text-sm font-medium animate-fade-in">
              Merci pour ton message, il a bien été envoyé !
            </p>
          )}
          {status === "error" && (
            <p className="text-red-700 text-sm font-medium animate-fade-in">
              Une erreur est survenue. Réessaie dans un instant.
            </p>
          )}
          {status === "invalid" && (
            <p className="text-red-700 text-sm font-medium animate-fade-in">
              Merci de corriger les champs indiqués avant l’envoi.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
