# Rapport — Chantier 1 : refonte de l'architecture d'information du site

> **Branche** : `claude/thelocomotionlab-reorganization-zbte6u` (20 commits, tout est poussé).
> **État** : PR1 à PR5 implémentées et vérifiées. Le site en production n'a **pas bougé** :
> rien ne change tant que la branche n'est pas fusionnée dans `main` (voir « Publier » en fin
> de rapport). Brief de référence : `docs/refonte-brief.md`.

## Le site, avant / après

| Avant | Après |
|---|---|
| Carnets (`/articles`) et Projets (`/projets`) | **Comprendre** (`/comprendre`, la science — articles `type: "article"`) et **Explorer** (`/explorer`, le terrain — récits + projets fusionnés) |
| Hub `/labo` | **Manifeste** (`/manifeste`) — `/labo` redirige en 301 |
| — | **Outils** (`/outils`, `/outils/twin` en teaser honnête) |
| `/live` = redirection temporaire | **`/live` = hub permanent** : direct actif ou « prochain départ » |
| Nav : Carnets · Projets · Soutenir | Nav : **Comprendre · Explorer · Outils ▾ · Le Lab ▾** (menus accessibles au clavier) |
| Emails → Google Sheet (inutilisable légalement) | **Liste auto-hébergée (Listmonk sur le VPS)** + double opt-in, envoi délégué à Brevo |

Chaque ancienne adresse (y compris les brouillons) répond par une **redirection permanente**
vers sa nouvelle adresse — aucun lien externe ni référencement n'est cassé. Les fichiers
`.md` bruts restent servis. Les contenus `published: false` ne sont exposés nulle part
(seule exception voulue : la carte « à paraître » de `/comprendre`, sans lien, corps jamais lu).

## PR par PR

### PR1 — Le grand déménagement (routes, redirections, liens, nav)

- **`lib/contentRoutes.mjs`** : LA source unique du modèle de contenu (slug = nom de fichier,
  `type` du frontmatter → pilier, contrôle de collision de slugs qui fait échouer le build en
  nommant les deux fichiers fautifs). Consommée par toutes les pages, tous les émetteurs d'URL
  **et** par les redirections — une seule vérité au lieu de 8 copies du mapping.
- **14 redirections 308 générées au build** depuis le frontmatter (`lib/legacyRedirects.mjs`),
  par slug exact. Choix validé : 308 (équivalent moderne du 301, identique pour Google).
- `/comprendre` : état vide nominal + **carte teaser** « Développe ta respiration
  fonctionnelle » (badge « En écriture », sans lien) + intro provisoire + capture email.
- `/explorer` : 5 fiches publiées, étiquettes Récit/Projet, tri `activityAt ?? date`,
  statuts et « dernières notes » des projets conservés.
- `/explorer/[slug]` : chargeur unifié (récits puis projets), rendu à l'identique
  (plots, replays, sommaire, citations, ancres, partage).
- Recherche, sitemap, llms.txt, flux « récents » : toutes les URL émises pointent vers les
  nouveaux piliers ; brouillons et teasers exclus partout ; au passage, la recherche utilise
  enfin le `href` de l'index (au lieu de reconstruire les URL en dur) et le sitemap abandonne
  son parseur artisanal pour la source unique.
- **7 liens internes des markdown publiés** réécrits (inventaire présenté et validé avant
  édition), ancres conservées.
- Navbar refaite : menus déroulants **accessibles** (clavier, Échap, clic extérieur,
  `aria-expanded`), accordéons mobiles. Icônes ajustées sur ton retour : livre = Comprendre,
  **boussole = Explorer**, flasque = Le Lab.
- Découverte en route : sous Cloudflare (`next-on-pages`), une route sans aucune page
  pré-générée exige un mode incompatible avec notre site 100 % statique → les brouillons
  d'articles sont pré-rendus en 404 (ils deviennent de vraies pages dès `published: true`).

### PR2 — Manifeste et Outils

- **`/manifeste`** : page longue en 5 sections (constat → robustesse → méthode → laboratoire
  N=1 → par où commencer), textes provisoires structurés, capture email. `/labo` → 301
  (fichier conservé et neutralisé, règle « pas de suppression » respectée).
- **`/outils`** : index sobre (une carte Twin, « D'autres instruments sont en construction
  au Lab. » — rien de daté, rien de promis).
- **`/outils/twin`** : teaser texte seul (aucun logo Twin) — promesse, « comment ça marche »
  en trois pas, **encadré de calibration honnête** (valeurs factices marquées `À REMPLACER`),
  CTA « Rejoindre la cohorte de calibration » → formulaire de contact **pré-rempli**
  (`/contact?sujet=twin`, option a validée), capture email.

### PR3 — Live

- Constat de la cartographie : la « bannière live » du brief n'existait pas (bloc commenté) ;
  la vraie source d'état est le `live-timer.json` du service de tracking. Une **sonde légère**
  (`useLiveTimer`) lit ce même fichier — aucun second mécanisme.
- **`/live`** : direct actif → carte live pleine page ; sinon → « Prochain départ : Tour des
  Écrins en autonomie · 20–24 août 2026 · 194 km · ~12 000 m D+ » + capture email. Dans les
  deux états : 3 lectures curées + la phrase pack. **`lib/liveConfig.js`** = le seul fichier
  à éditer par aventure.
- **Bloc compact sur `/explorer`** (et la home en PR5) : badge « EN DIRECT » ou rappel du
  prochain départ.
- **Cartels de provenance** ajoutés sous les 4 replays (« Direct v1 (2025/2026) — smartphone
  + Traccar, conservé tel quel. », textes validés avant édition).
- **`docs/live-archive-schema.md`** : contrat versionné `archive.json` pour le chantier 2
  (journal Telegram, mur) ; les replays actuels restent des pièces v1.

### PR4 — Email : la liste souveraine (architecture révisée ensemble)

Décision prise en cours de route (tes questions sur Brevo) : au lieu de confier la liste à
Brevo, **la liste vit sur ton VPS** (Listmonk auto-hébergé) et Brevo est réduit au rôle de
**tuyau d'envoi SMTP** (gratuit, remplaçable par Amazon SES en trois lignes de config).

- **`infra/`** : conteneurs Listmonk (version épinglée) + PostgreSQL, route Caddy
  `liste.thelocomotionlab.com`, section **Sauvegardes** au README (la liste = données
  personnelles chez toi).
- **`services/email-gateway`** (Worker Cloudflare, TypeScript) : `POST /subscribe
  {email, source}` → contact créé dans Listmonk avec sa provenance, **double opt-in envoyé
  par Listmonk** (gardé, sur ta validation ; débrayable par liste). Garde-fous : validation,
  CORS restreint au site, honeypot anti-robots, limite de débit, pas d'énumération d'adresses,
  secrets hors du repo.
- **Côté site** : `EmailCapture` (ex-NewsletterSignup, réexport de compatibilité), la
  **micro-promesse partout à l'identique** — « Pas de newsletter. Un email quand quelque
  chose paraît ici. » — et une `source` par formulaire : `comprendre · manifeste · twin ·
  live · home`. (La capture en pied de page a été ajoutée puis **retirée sur ton retour**.)
- **Filet de sécurité** : tant que la variable `NEXT_PUBLIC_EMAIL_ENDPOINT` n'est pas posée,
  le site utilise l'**ancien flux** (Worker send-email + Google Sheet) — la bascule est un
  changement d'environnement, pas de code, réversible.
- **`docs/email-setup.md`** : ta checklist pas-à-pas (~40 min) — déploiement, liste « Le
  Lab », compte Brevo (clé SMTP seulement), texte français de l'email de confirmation fourni,
  import du Google Sheet en `source=legacy`, SPF/DKIM avant la première campagne, bascule,
  porte de sortie SES.

### PR5 — Home et cohérence finale

- **Hero** : la formule en titre — « Comprendre le corps comme un scientifique. L'utiliser
  comme un animal. » — sous-titre provisoire (texte n°1), CTA « Lire le manifeste ».
- Bloc live sous le hero · **« Dernières parutions »** (les deux flux fusionnés, tri métier
  mixte) · **carte Locomotion Twin** · section « Qu'est-ce que le Locomotion Lab ? » et sa
  capture conservées.
- `CLAUDE.md` mis à jour (nouvelle IA, composants réels de `packages/ui`, `email-gateway`,
  Listmonk).
- **Balayage automatisé final** : crawl de tout le site construit — 22 pages en 200, toutes
  les redirections aboutissent, **aucun lien interne cassé**.

## Vérifications (faites, pas supposées)

À chaque PR : `pnpm -F site build` (webpack) ✅ · `pnpm -F site lint` ✅ · build
`@cloudflare/next-on-pages` ✅ avec inspection des redirections réellement générées dans la
sortie Cloudflare. En plus, **tests en vrai navigateur** : les deux états du live (mock du
serveur de tracking), les menus déroulants (clavier, Échap, exclusivité), le pré-remplissage
du contact, la soumission réelle d'un formulaire (payload `{email, source}` exact), la
micro-promesse sur chaque page ; et la passerelle testée sous `wrangler dev` (tous les cas
d'erreur + limite de débit). Le typage strict du Worker passe.

## Ce qui t'attend (rien d'urgent, dans l'ordre conseillé)

1. **Cliquer la recette** sur `pnpm dev:site` (ou attendre la mise en ligne) : nav, les 3
   nouvelles sections, un récit, un projet, la recherche, quelques anciennes URL.
2. **Publier** (voir ci-dessous).
3. **Écrire les textes définitifs** — tout est en place avec des repères visibles
   `[PROVISOIRE — texte n°X]` et le brief en commentaire au-dessus de chaque : n°1 (hero),
   n°2 (manifeste, 1 200–1 800 mots), n°3 (intro Comprendre), n°5 (intro Explorer), n°6
   (page Twin), n°7 (bloc prochain départ) ; ajuster le `teaserText` (n°4).
4. **Remplacer les valeurs factices** marquées `À REMPLACER` : encadré de calibration du
   Twin, bornes altimétriques et trace GPX des Écrins (`apps/site/lib/liveConfig.js`).
5. **La liste email** : suivre `docs/email-setup.md` (Listmonk sur le VPS, compte Brevo,
   test de bout en bout, import du Google Sheet, bascule). Avant la campagne d'annonce des
   Écrins : SPF/DKIM (c'est dans la checklist).

## Publier

Tout vit sur la branche `claude/thelocomotionlab-reorganization-zbte6u`. Pour mettre en
ligne : ouvrir une **pull request** sur GitHub (la page qui montre toutes les modifications
et le bouton *Merge*) de cette branche vers `main` — je peux l'ouvrir et te donner le lien,
il ne te restera qu'à cliquer *Merge*. Cloudflare Pages redéploiera le site automatiquement,
**aucun réglage Cloudflare à changer** (la seule variable nouvelle,
`NEXT_PUBLIC_EMAIL_ENDPOINT`, ne se pose qu'à la bascule email, plus tard).

## Hors périmètre, comme convenu (chantier 2)

Journal Telegram, mur/chat, pronostic, OG dynamique, campagnes Brevo/Listmonk,
enrichissement des replays (le contrat `archive.json` est prêt), logo Twin, migration
TypeScript du site. Les fichiers Chianti / Lavaredo / GRF 2025 n'ont pas été touchés :
le code tolère leur absence comme leur publication future.
