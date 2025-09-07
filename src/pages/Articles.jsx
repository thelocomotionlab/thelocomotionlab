import { Link } from "react-router-dom";
import { Mountain, Wind, Snowflake, FileText } from "lucide-react";

export default function Articles() {
  const posts = [
    { title: "Trail en sandales : mon premier 100 miles", desc: "Un récit d’expérience et d’exploration des limites physiques et mentales.", icon: <Mountain className="text-[#8CB9BD]" size={28}/>, link: "#" },
    { title: "Respiration et états de conscience", desc: "Analyse scientifique des fréquences respiratoires et leur lien avec les ondes cérébrales.", icon: <Wind className="text-[#8CB9BD]" size={28}/>, link: "#" },
    { title: "L’hormèse par le froid et le chaud", desc: "Approche pratique et scientifique des expositions extrêmes pour renforcer le corps.", icon: <Snowflake className="text-[#8CB9BD]" size={28}/>, link: "#" },
  ];

  return (
    <section className="p-12 bg-[#FEFBF6] relative">
      <h3 className="text-3xl font-bold text-center mb-8 text-[#8CB9BD]">Carnets du Lab</h3>
      <div className="grid md:grid-cols-3 gap-8">
        {posts.map((post, idx) => (
          <div key={idx} className="bg-white rounded-2xl shadow-md p-6 hover:shadow-2xl transition relative overflow-hidden">
            <div className="relative mb-4">{post.icon}</div>
            <h4 className="relative text-xl font-semibold mb-3 text-[#B67352]">{post.title}</h4>
            <p className="relative text-sm mb-4">{post.desc}</p>
            <Link to={post.link} className="relative text-[#EFB159] font-semibold hover:underline flex items-center space-x-1">
              <FileText size={16}/> <span>Lire l’article</span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
