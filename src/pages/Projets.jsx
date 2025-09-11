import { projects } from "../content/projects";

export default function Projets() {
  return (
    <section className="py-12">
      <h2 className="text-3xl font-bold mb-2 text-brand-primary text-center">Projets du Labo</h2>
      <p className="text-center mb-8 opacity-80">Suivi expérimental vivant — différent des Carnets (contenus finalisés).</p>
      <div className="grid md:grid-cols-3 gap-8 justify-center">
        {projects.map(p => (
          <a key={p.id} id={p.id} href={`#${p.id}`} className="bg-white rounded-xl shadow-card p-6 hover:shadow-xl transition">
            <div className="text-xs uppercase tracking-wide mb-2 opacity-70">{p.status}</div>
            <h3 className="text-xl font-semibold text-brand-deep mb-2">{p.title}</h3>
            <p className="text-sm mb-4">{p.summary}</p>
            <div className="border-t pt-3">
              <p className="text-xs mb-2 font-medium">Dernières notes :</p>
              <ul className="space-y-1">
                {p.updates.map(u => (
                  <li key={u.date} className="text-sm"><span className="opacity-60 mr-2">{new Date(u.date).toLocaleDateString('fr-FR')}</span>{u.text}</li>
                ))}
              </ul>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}