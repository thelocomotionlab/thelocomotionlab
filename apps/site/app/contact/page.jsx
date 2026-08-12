// app/contact/page.jsx
import ContactForm from "@/components/ContactForm";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

const SITE_URL = "https://thelocomotionlab.com";

export const metadata = {
  title: "Contact – The Locomotion Lab",
  description:
    "Contacte le Locomotion Lab pour toute question, collaboration ou projet.",
  alternates: {
    canonical: `${SITE_URL}/contact`,
  },
  openGraph: {
    title: "Contact – The Locomotion Lab",
    description:
      "Contacte le Locomotion Lab pour toute question, collaboration ou projet.",
    url: `${SITE_URL}/contact`,
    type: "website",
    locale: "fr_FR",
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact – The Locomotion Lab",
    description:
      "Contacte le Locomotion Lab pour toute question, collaboration ou projet.",
    images: [OG_IMAGE],
  },
};

export default function ContactPage() {
  return <ContactForm />;
}
