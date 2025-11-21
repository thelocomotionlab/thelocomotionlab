export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/private/', // Si tu as des zones privées
    },
    sitemap: 'https://thelocomotionlab.com/sitemap.xml',
  }
}