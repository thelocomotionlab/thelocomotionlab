export default function Contact() {
  return (
    <section className="p-12 bg-[#8CB9BD] text-center text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-30" />
      <h3 className="text-3xl font-bold mb-6 relative">Contact</h3>
      <p className="mb-4 relative">Une question, une collaboration ou une idée ?</p>
      <a href="mailto:contact@thelocomotionlab.com" className="relative bg-[#EFB159] text-white px-6 py-3 rounded-full font-semibold shadow-md hover:bg-[#d99e41] transition">
        contact@thelocomotionlab.com
      </a>
    </section>
  );
}
