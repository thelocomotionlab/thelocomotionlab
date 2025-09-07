import { BookOpen, Sticker, ShoppingBag } from "lucide-react";

export default function Boutique() {
  const items = [
    { title: "Ebook : Respiration Primal", price: "9€", icon: <BookOpen className="text-[#8CB9BD]" size={28}/> },
    { title: "Sticker Locomotion Lab", price: "2€", icon: <Sticker className="text-[#8CB9BD]" size={28}/> },
    { title: "Pack Ebook + Stickers", price: "10€", icon: <ShoppingBag className="text-[#8CB9BD]" size={28}/> },
  ];

  return (
    <section className="p-12 bg-[#8CB9BD] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-tr from-white/20 via-transparent to-white/20 opacity-50 pointer-events-none" />
      <h3 className="text-3xl font-bold text-center mb-8 relative">Boutique</h3>
      <div className="grid md:grid-cols-3 gap-8 relative">
        {items.map((item, idx) => (
          <div key={idx} className="bg-white text-[#333333] rounded-2xl shadow-md p-6 text-center hover:shadow-xl transition relative overflow-hidden">
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
  );
}
