import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Labo from "./pages/Labo";
import Articles from "./pages/Articles";
import Article from "./pages/Article";
import Projets from "./pages/Projets";
import Soutenir from "./pages/Soutenir";
import Mentions from "./pages/Mentions";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Search from "./pages/Search"; // import ajouté

export default function App() {
  return (
    <div className="font-sans bg-brand-bg text-brand-text relative overflow-hidden min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/labo" element={<Labo />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/articles/:slug" element={<Article />} />
          <Route path="/projets" element={<Projets />} />
          <Route path="/soutenir" element={<Soutenir />} />
          <Route path="/mentions-legales" element={<Mentions />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/recherche" element={<Search />} /> {/* route ajoutée */}
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
