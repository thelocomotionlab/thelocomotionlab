# Polices auto-hébergées de la charte

Fichiers woff2 officiels (sous-ensemble **latin**, couvre tout le français
y compris œ et les guillemets typographiques), téléchargés depuis Google
Fonts et servis par `next/font/local` via `packages/ui/src/fonts.ts` :

- **Ubuntu** 300 / 400 / 500 / 700 — [Ubuntu Font Licence 1.0](https://ubuntu.com/legal/font-licence)
- **Lora** variable 400→700, romain + italique — [SIL Open Font License 1.1](https://openfontlicense.org)
- **Ubuntu Mono** 400 / 700 — Ubuntu Font Licence 1.0

Pourquoi auto-hébergées : `next/font/google` télécharge les polices AU
BUILD ; en cas d'échec réseau, Next publie silencieusement une police de
secours (simple warning) — c'est arrivé en production. Ici, les fichiers
sont dans le repo : builds déterministes, aucun appel externe.

Pour mettre à jour : récupérer les URLs woff2 « latin » via
`https://fonts.googleapis.com/css2?family=…` (User-Agent navigateur) et
remplacer les fichiers en conservant les noms.
