/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/live',
        destination: 'https://www.thelocomotionlab.com/projets/traversee-reunion#la-travers%C3%A9e-de-la-r%C3%A9union-en-direct',
        // `permanent: false` effectue une redirection 307 (équivalent au 302).
        // Passe-le à `true` (308/301) uniquement si cette URL `/live` pointera
        // TOUJOURS vers cette page précise, même après ton retour de la Réunion.
        permanent: false, 
      },
    ];
  },
};

export default nextConfig;