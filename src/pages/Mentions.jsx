export default function Mentions() {
  return (
    <section className="py-12">
      <h1 className="text-3xl font-bold mb-6 text-brand-primary">Mentions légales</h1>
      <div className="bg-white rounded-xl shadow-card p-6 prose max-w-none">
        <h2>Éditeur</h2>
        <p>Locomotion Lab — thelocomotionlab.com</p>
        <h2>Contact</h2>
        <p><a href="mailto:contact@thelocomotionlab.com">contact@thelocomotionlab.com</a></p>
        <h2>Hébergement</h2>
        <p>À compléter selon votre hébergeur.</p>
        <h2>Propriété intellectuelle</h2>
        <p>Contenus © {new Date().getFullYear()} Locomotion Lab — tous droits réservés.</p>
      </div>
    </section>
  );
}