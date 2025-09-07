import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Activity, Flame, ShoppingBag, Mail, Mountain, Wind, Snowflake, FileText, Sticker } from "lucide-react";
import logo from "./logo.png"; // Assure-toi que ton fichier est placé dans /public ou /src

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="font-sans bg-[#FEFBF6] text-[#333333] relative overflow-hidden">
      {/* Reflet global de labo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-1/2 h-40 bg-white opacity-20 blur-3xl rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-1/2 h-40 bg-white opacity-10 blur-2xl rounded-full" />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between p-4 shadow-md bg-white sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          {/* Logo */}
          <img src={logo} alt="Locomotion Lab Logo" className="h-12 w-auto" />
{/*          <h1 className="text-xl font-bold">Locomotion Lab</h1>
*/}        </div>
        <nav className="hidden md:flex space-x-6 font-medium">
          <a href="#home" className="hover:text-[#EFB159] flex items-center space-x-1"><Activity size={18}/> <span>Accueil</span></a>
          <a href="#carnets" className="hover:text-[#EFB159] flex items-center space-x-1"><BookOpen size={18}/> <span>Carnets du Lab</span></a>
          <a href="#shop" className="hover:text-[#EFB159] flex items-center space-x-1"><ShoppingBag size={18}/> <span>Boutique</span></a>
          <a href="#about" className="hover:text-[#EFB159] flex items-center space-x-1"><Flame size={18}/> <span>À propos</span></a>
          <a href="#contact" className="hover:text-[#EFB159] flex items-center space-x-1"><Mail size={18}/> <span>Contact</span></a>
        </nav>
        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
      </header>

      {menuOpen && (
        <div className="md:hidden bg-white shadow-md p-4 space-y-3">
          <a href="#home" className="block">Accueil</a>
          <a href="#carnets" className="block">Carnets du Lab</a>
          <a href="#shop" className="block">Boutique</a>
          <a href="#about" className="block">À propos</a>
          <a href="#contact" className="block">Contact</a>
        </div>
      )}

      {/* Hero */}
      <section id="home" className="relative min-h-screen flex flex-col items-center justify-center text-center p-8 bg-[#8CB9BD] text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 via-transparent to-white/20 opacity-80 pointer-events-none" />
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="relative text-4xl md:text-6xl font-bold mb-6 drop-shadow-lg">
          Explorer le mouvement, le corps et l'esprit
        </motion.h2>
        <p className="relative max-w-2xl text-lg md:text-xl mb-8 drop-shadow-md">
          Bienvenue au Locomotion Lab, un espace dédié au trail primal, au parkour naturel, à l’hormèse et à la recherche sur la respiration et la conscience.
        </p>
        <a href="#carnets" className="relative bg-[#EFB159] text-white px-6 py-3 rounded-full font-semibold shadow-lg hover:bg-[#d99e41] transition">
          Découvrir les Carnets du Lab
        </a>
      </section>

      {/* Carnets du Lab */}
      <section id="carnets" className="p-12 bg-[#FEFBF6] relative">
        <h3 className="text-3xl font-bold text-center mb-8 text-[#8CB9BD]">Carnets du Lab</h3>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { title: "Trail en sandales : mon premier 100 miles", desc: "Un récit d’expérience et d’exploration des limites physiques et mentales.", icon: <Mountain className="text-[#8CB9BD]" size={28}/> },
            { title: "Respiration et états de conscience", desc: "Analyse scientifique des fréquences respiratoires et leur lien avec les ondes cérébrales.", icon: <Wind className="text-[#8CB9BD]" size={28}/> },
            { title: "L’hormèse par le froid et le chaud", desc: "Approche pratique et scientifique des expositions extrêmes pour renforcer le corps.", icon: <Snowflake className="text-[#8CB9BD]" size={28}/> },
          ].map((post, idx) => (
            <div key={idx} className="bg-white rounded-2xl shadow-md p-6 hover:shadow-2xl transition relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-40" />
              <div className="relative mb-4">{post.icon}</div>
              <h4 className="relative text-xl font-semibold mb-3 text-[#B67352]">{post.title}</h4>
              <p className="relative text-sm mb-4">{post.desc}</p>
              <a href="#" className="relative text-[#EFB159] font-semibold hover:underline flex items-center space-x-1">
                <FileText size={16}/> <span>Lire l’article</span>
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Boutique */}
      <section id="shop" className="p-12 bg-[#8CB9BD] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 via-transparent to-white/20 opacity-50 pointer-events-none" />
        <h3 className="text-3xl font-bold text-center mb-8 relative">Boutique</h3>
        <div className="grid md:grid-cols-3 gap-8 relative">
          {[
            { title: "Ebook : Respiration Primal", price: "9€", icon: <BookOpen className="text-[#8CB9BD]" size={28}/> },
            { title: "Sticker Locomotion Lab", price: "2€", icon: <Sticker className="text-[#8CB9BD]" size={28}/> },
            { title: "Pack Ebook + Stickers", price: "10€", icon: <ShoppingBag className="text-[#8CB9BD]" size={28}/> },
          ].map((item, idx) => (
            <div key={idx} className="bg-white text-[#333333] rounded-2xl shadow-md p-6 text-center hover:shadow-xl transition relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-30" />
              <div className="relative mb-4 flex justify-center">{item.icon}</div>
              <h4 className="relative text-xl font-semibold mb-2 text-[#B67352]">{item.title}</h4>
              <p className="relative text-lg mb-4">{item.price}</p>
              <button className="relative bg-[#EFB159] text-white px-4 py-2 rounded-full hover:bg-[#d99e41] transition">
                Acheter
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section id="about" className="p-12 bg-white text-center relative">
        <h3 className="text-3xl font-bold mb-6 text-[#8CB9BD]">À propos</h3>
        <p className="max-w-3xl mx-auto text-lg">
          Je suis passionné par le mouvement sous toutes ses formes : trail en sandales, parkour primal, grimpe d’arbres, respiration et exploration des états de conscience. Le Locomotion Lab est mon laboratoire vivant, où je documente mes expériences et mes recherches scientifiques pour les partager avec une communauté en quête de sens, de performance et d’harmonie avec la nature.
        </p>
      </section>

      {/* Contact */}
      <section id="contact" className="p-12 bg-[#8CB9BD] text-center text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-30" />
        <h3 className="text-3xl font-bold mb-6 relative">Contact</h3>
        <p className="mb-4 relative">Une question, une collaboration ou une idée ?</p>
        <a href="mailto:contact@thelocomotionlab.com" className="relative bg-[#EFB159] text-white px-6 py-3 rounded-full font-semibold shadow-md hover:bg-[#d99e41] transition">
          contact@thelocomotionlab.com
        </a>
      </section>

      {/* Footer */}
      <footer className="bg-[#B67352] text-white text-center py-6 relative">
        <p>© {new Date().getFullYear()} Locomotion Lab — Tous droits réservés.</p>
      </footer>
    </div>
  );
}
