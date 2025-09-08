import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Articles from "./pages/Articles";
import Article from "./pages/Article";
import Boutique from "./pages/Boutique";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";


export default function App() {
  return (
    <div className="font-sans bg-[#FEFBF6] text-[#333333] relative overflow-hidden">
      {/* Reflet global de labo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-1/2 h-40 bg-white opacity-20 blur-3xl rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-1/2 h-40 bg-white opacity-10 blur-2xl rounded-full" />
      </div>

      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/:slug" element={<Article />} />
        <Route path="/boutique" element={<Boutique />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
      </Routes>
      <Footer />
    </div>
  );
}
