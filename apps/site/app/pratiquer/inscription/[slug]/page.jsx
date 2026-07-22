// app/pratiquer/inscription/[slug]/page.jsx
//
// Page d'inscription à un atelier (arrivée depuis « Je réserve ma place »
// de la page Pratiquer). Une page statique par atelier du catalogue
// (lib/ateliers.mjs) ; tout le formulaire vit dans InscriptionForm
// (handoff « Inscription Atelier » — instrument de preuve, structure = PDF).
// Hors sitemap et noindex : page fonctionnelle, pas une page de contenu.
import { notFound } from "next/navigation";
import InscriptionForm from "@/components/inscription/InscriptionForm";
import { listAteliers } from "@/lib/ateliers.mjs";

export const dynamicParams = false;

export async function generateStaticParams() {
  return listAteliers().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const atelier = listAteliers().find((a) => a.slug === slug);
  return {
    title: atelier ? `Inscription – ${atelier.title}` : "Inscription à un atelier",
    robots: { index: false, follow: false },
  };
}

export default async function InscriptionPage({ params }) {
  const { slug } = await params;
  const atelier = listAteliers().find((a) => a.slug === slug);
  if (!atelier) notFound();

  return <InscriptionForm atelier={atelier} />;
}
