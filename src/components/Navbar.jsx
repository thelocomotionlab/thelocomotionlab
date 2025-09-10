import { Link } from "react-router-dom";
import { BookOpen, Activity, Flame, ShoppingBag, Mail, Menu, X } from "lucide-react";
import { useState } from "react";
import logo from "../assets/logo.png";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="flex items-center justify-between p-4 shadow-md bg-white/90 backdrop-blur sticky top-0 z-50">
      <div className="flex items-center space-x-3">
        <img src={logo} alt="Locomotion Lab" className="h-12 w-auto" loading="lazy" />
      </div>
      <nav className="hidden md:flex space-x-6 font-medium" aria-label="Navigation principale">
        <Link to="/" className="hover:text-[#EFB159] flex items-center space-x-1">
          <Activity size={18}/> <span>Accueil</span>
        </Link>
        <Link to="/articles" className="hover:text-[#EFB159] flex items-center space-x-1">
          <BookOpen size={18}/> <span>Carnets du Lab</span>
        </Link>
        <Link to="/boutique" className="hover:text-[#EFB159] flex items-center space-x-1">
          <ShoppingBag size={18}/> <span>Boutique</span>
        </Link>
        <Link to="/about" className="hover:text-[#EFB159] flex items-center space-x-1">
          <Flame size={18}/> <span>À propos</span>
        </Link>
        <Link to="/contact" className="hover:text-[#EFB159] flex items-center space-x-1">
          <Mail size={18}/> <span>Contact</span>
        </Link>
      </nav>
      {/* Bouton mobile */}
      <button
        className="md:hidden inline-flex items-center justify-center p-2 rounded-md hover:bg-gray-100"
        aria-controls="mobile-menu"
        aria-expanded={open}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      {/* Menu mobile */}
      {open && (
        <div id="mobile-menu" className="absolute top-full inset-x-0 bg-white shadow-lg md:hidden">
          <div className="flex flex-col p-4 space-y-3" role="menu" aria-label="Navigation mobile">
            <Link to="/" onClick={() => setOpen(false)} className="py-2">Accueil</Link>
            <Link to="/articles" onClick={() => setOpen(false)} className="py-2">Carnets du Lab</Link>
            <Link to="/boutique" onClick={() => setOpen(false)} className="py-2">Boutique</Link>
            <Link to="/about" onClick={() => setOpen(false)} className="py-2">À propos</Link>
            <Link to="/contact" onClick={() => setOpen(false)} className="py-2">Contact</Link>
          </div>
        </div>
      )}      
    </header>
  );
}
