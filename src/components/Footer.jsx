export default function Footer() {
  return (
    <footer className="bg-brand-deep text-white text-center py-8 mt-12">
      <p className="mb-2">© {new Date().getFullYear()} Locomotion Lab — Tous droits réservés.</p>
      <nav aria-label="Liens de pied de page" className="space-x-4 text-sm">
        <a className="underline-offset-4 hover:underline" href="/about">À propos</a>
        <a className="underline-offset-4 hover:underline" href="/contact">Contact</a>
        <a className="underline-offset-4 hover:underline" href="/articles">Articles</a>
      </nav>
    </footer>
  );
}