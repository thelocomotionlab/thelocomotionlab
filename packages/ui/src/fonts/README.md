# Polices auto-hébergées de la charte

Fichiers woff2 officiels (sous-ensemble **latin**, couvre tout le français
y compris œ et les guillemets typographiques), servis par `next/font/local`
via `packages/ui/src/fonts.ts` :

- **Ubuntu Sans** variable 300 → 800, romain + italique — [Ubuntu Font Licence 1.0](https://ubuntu.com/legal/font-licence)
- **Ubuntu Sans Mono** variable 400 → 700 — Ubuntu Font Licence 1.0

Une seule famille porte le site : Ubuntu Sans pour les titres et le corps,
Ubuntu Sans Mono pour les étiquettes en petites capitales.

Pourquoi auto-hébergées : `next/font/google` télécharge les polices AU
BUILD ; en cas d'échec réseau, Next publie silencieusement une police de
secours (simple warning) — c'est arrivé en production. Ici, les fichiers
sont dans le repo : builds déterministes, aucun appel externe.

Pour mettre à jour : `npm pack @fontsource-variable/ubuntu-sans` (et
`-mono`), prendre les woff2 « latin » du paquet et remplacer les fichiers
en conservant les noms.
