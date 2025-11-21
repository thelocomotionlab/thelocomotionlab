// app/soutenir/page.jsx
import SoutenirSection from "@/components/SoutenirSection";

export const metadata = {
  title: "Soutenir le Labo – The Locomotion Lab",
  description:
    "Contribue au développement du Locomotion Lab : financement matériel, soutien aux expérimentations et à la création de contenus indépendants.",
  alternates: {
    canonical: "https://thelocomotionlab.com/soutenir",
  },
};

export default function SoutenirPage() {
  return <SoutenirSection />;
}
