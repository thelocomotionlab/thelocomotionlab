// src/pages/Soutenir.jsx
export default function Soutenir() {
  const items = [
    {
      title: "Sticker Locomotion Lab",
      price: "2€",
      cta: "Bientôt dispo",
    },
    {
      title: "Merch",
      price: "à venir",
      cta: "Restez informé·e",
    },
    {
      title: "Autres formes de soutien",
      price: "",
      cta: "À venir",
    },
  ];

  return (
    <section className="py-12">
      {/* Titre principal */}
      <h3 className="text-3xl font-bold text-center mb-8 text-brand-primary">
        Soutenir le Labo
      </h3>

      {/* Grille des cartes */}
      <div className="grid md:grid-cols-3 gap-8">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl shadow-card p-6 text-center hover:shadow-xl transition"
          >
            <h4 className="text-xl font-semibold mb-2 text-brand-deep">
              {item.title}
            </h4>
            {item.price && <p className="text-lg mb-4">{item.price}</p>}
            <button
              disabled
              className="bg-brand-accent/80 text-white px-4 py-2 rounded-full font-semibold opacity-70 cursor-not-allowed"
            >
              {item.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Message en bas de page */}
      <p className="text-center text-sm opacity-70 mt-6 max-w-xl mx-auto">
        Le <strong>Locomotion Lab</strong> est un projet indépendant.  
        Votre futur soutien aidera à financer les expérimentations, le matériel
        et la création de contenus autour du mouvement, de la respiration et de
        l’hormèse.
      </p>
    </section>
  );
}
