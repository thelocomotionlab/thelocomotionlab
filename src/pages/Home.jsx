import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center p-8 bg-[#8CB9BD] text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 via-transparent to-white/20 opacity-80 pointer-events-none" />
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="relative text-4xl md:text-6xl font-bold mb-6 drop-shadow-lg">
          Explorer le mouvement, le corps et l'esprit
        </motion.h2>
        <p className="relative max-w-2xl text-lg md:text-xl mb-8 drop-shadow-md">
          Bienvenue au Locomotion Lab, un espace dédié au trail primal, au parkour naturel, à l’hormèse et à la recherche sur la respiration et la conscience.
        </p>
        <Link to="/articles" className="relative bg-[#EFB159] text-white px-6 py-3 rounded-full font-semibold shadow-lg hover:bg-[#d99e41] transition">
          Découvrir les Carnets du Lab
        </Link>
      </section>
    </>
  );
}
