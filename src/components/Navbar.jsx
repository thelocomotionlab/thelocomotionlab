import { Link } from "react-router-dom";
import { BookOpen, Activity, Flame, ShoppingBag, Mail } from "lucide-react";
import logo from "../assets/logo.png";

export default function Navbar() {
  return (
    <header className="flex items-center justify-between p-4 shadow-md bg-white sticky top-0 z-50">
      <div className="flex items-center space-x-3">
        <img src={logo} alt="Locomotion Lab Logo" className="h-12 w-auto" />
      </div>
      <nav className="hidden md:flex space-x-6 font-medium">
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
    </header>
  );
}
