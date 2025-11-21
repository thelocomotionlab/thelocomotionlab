// app/contact/page.jsx
import ContactForm from "@/components/ContactForm";

export const metadata = {
  title: "Contact – The Locomotion Lab",
  description:
    "Contacte le Locomotion Lab pour toute question, collaboration ou projet.",
  alternates: {
    canonical: "https://thelocomotionlab.com/contact",
  },
};

export default function ContactPage() {
  return <ContactForm />;
}
