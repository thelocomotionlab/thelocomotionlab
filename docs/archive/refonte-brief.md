# Brief — Chantier 1 : refonte de l'architecture d'information du site

> **Lecteur : Claude Code**, exécuté à la racine du monorepo `thelocomotionlab-website`.
> Ce brief complète `CLAUDE.md` (lu automatiquement) : ses conventions et garde-fous s'appliquent intégralement.
> **Autorité finale : Valentin.** Toute décision de ce brief peut être révisée par lui en cours de route — ce document décrit l'intention, la réalité du code et le regard de Valentin priment. En cas de contradiction entre ce brief et le code existant : signaler, proposer, ne jamais forcer.

---

## 0. Règles de travail (à lire avant toute action)

1. **Une PR à la fois, dans l'ordre (PR1 → PR5).** Jamais deux chantiers ouverts.
2. **Mode plan obligatoire** au début de chaque PR : présenter le plan détaillé (fichiers touchés, approche technique, inventaires) et **attendre la validation de Valentin** avant d'écrire du code.
3. **Deux points d'arrêt par PR** : ① après le plan ; ② après l'implémentation — présenter un résumé des diffs + la checklist de recette (URLs à tester sur `pnpm dev:site`) et attendre validation avant de considérer la PR terminée.
4. **Le site reste déployable à chaque merge.** Chaque PR laisse un état complet et cohérent (pas de lien mort « en attendant la PR suivante »).
5. **Vérifications avant de présenter une PR** : `pnpm -F site build` (webpack), `pnpm -F site lint`, et un build `@cloudflare/next-on-pages` qui passe.
6. **Branches** : `refonte/pr1-routes`, `refonte/pr2-manifeste-outils`, `refonte/pr3-live`, `refonte/pr4-email`, `refonte/pr5-home`. Commits logiques et atomiques.
7. **Contenus** : ne jamais exposer ni modifier le corps d'un fichier `published: false`. Les éditions de markdown publiés (réécriture de liens, cartels — voir PR1/PR3) sont **inventoriées et présentées avant modification**.
8. **Aucune suppression de fichier.** (Valentin gère lui-même les fichiers Chianti / Lavaredo / GRF 2025 : le code doit simplement tolérer leur absence éventuelle.)
9. **Aucun secret dans le repo** (cf. `CLAUDE.md` et `docs/secrets.md`).
10. En cas d'ambiguïté : **poser la question**, ne pas inventer.

---

## 1. Contexte et objectif

Le site (apps/site, Next.js App Router, **JavaScript**, déployé sur Cloudflare Pages) est réorganisé autour de la quête du Lab — la **robustesse physiologique** — et de sa formule : *« Comprendre le corps comme un scientifique, l'utiliser comme un animal. »* Les deux rayons actuels (Carnets `/articles`, Projets `/projets`) fusionnent en deux piliers : **Comprendre** (la science, articles `type: "article"`) et **Explorer** (le terrain, récits `type: "recit"` + projets). S'y ajoutent une page **Manifeste**, une section **Outils** (Locomotion Twin en teaser), un hub **Live** permanent, et une capture d'emails propre branchée sur **Brevo**.

Le champ `type` du frontmatter existe déjà : la migration est un **filtrage + déplacement de routes**, pas une migration de contenu.

## 2. Cible

```
Nav : Comprendre · Explorer · Outils ▾ (Locomotion Twin) · Le Lab ▾ (Manifeste, À propos, Soutenir, Contact)
      + bannière live globale existante (inchangée)

/                      hero (formule + quête) · dernières parutions · carte Twin · bloc live   [PR5]
/manifeste             la robustesse physiologique                                             [PR2]
/comprendre            index articles + carte « à paraître » + capture email                   [PR1]
/comprendre/[slug]     articles (type: article, published)                                     [PR1]
/explorer              bloc Live en tête + récits et projets fusionnés                         [PR1, bloc live PR3]
/explorer/[slug]       récits + projets (espace de noms commun, contrôle de collision)         [PR1]
/live                  direct actif OU « prochain départ » + cross-links + phrase pack         [PR3]
/outils · /outils/twin index sobre · page teaser du Twin                                       [PR2]
services/email-gateway Worker Cloudflare → Brevo (attribut source, double opt-in)              [PR4]
301                    anciens slugs → nouvelles routes, générées depuis le frontmatter        [PR1]
```

**Principes transverses** : la charte vient **exclusivement** de `packages/ui` (tokens, `PageShell`, `Prose`, `Card`, `Button`… — Ubuntu + Lora, pas de nouvelle couleur, pas de Geist). Les nouvelles pages **imitent les patterns des pages existantes** (structure, espacements, composants). Tout reste en JavaScript côté `apps/site` ; tout nouveau service est en TypeScript.

---

## 3. PR1 — Le grand déménagement (routes, redirections, liens, nav)

### 3.1 Index `/comprendre`
- Liste les contenus `type: "article"` et `published: true` (il n'y en a aucun aujourd'hui : l'état vide est un état **nominal et soigné**, pas un écran d'erreur).
- **Carte « à paraître »** : les fichiers avec `published: false` **et** `teaser: true` apparaissent comme carte **sans lien** (titre + `teaserText` + badge « En écriture »). Leur corps n'est **jamais** rendu, aucune route de détail n'existe pour eux, ils sont exclus de la recherche et du sitemap.
- Ajouter au frontmatter de `public/articles/developpe-ta-respiration-fonctionnelle.md` : `teaser: true` et `teaserText: "Article en cours d'écriture."` (texte provisoire, Valentin ajustera). **Uniquement ce fichier.**
- Intro de page : placeholder `[PROVISOIRE — texte n°3]` (brief en §8).
- En bas de page : composant de capture email, `source="comprendre"` (composant actuel en PR1, refactoré en PR4).

### 3.2 Index `/explorer`
- Fusionne `type: "recit"` (dossier `public/articles/`) et les projets (`public/projets/`), `published: true` uniquement.
- Tri par `activityAt ?? date`, décroissant. Étiquette discrète « Récit » / « Projet » sur chaque carte ; les projets affichent leur `status` (« En cours » / « Terminé ») comme aujourd'hui.
- Réserver l'emplacement du bloc Live en tête (implémenté en PR3).
- Intro : placeholder `[PROVISOIRE — texte n°5]`.

### 3.3 Détails `/comprendre/[slug]` et `/explorer/[slug]`
- Loader unifié : `/explorer/[slug]` cherche dans les récits **puis** les projets, et rend le bon corps (`ArticleBody` pour les récits, `ProjetBody` + `ProjetClientFx` pour les projets). `/comprendre/[slug]` rend `ArticleBody`.
- `generateStaticParams` fusionné en conséquence.
- **Contrôle de collision de slugs** entre récits et projets : en cas de doublon, le build échoue avec un message explicite nommant les deux fichiers.
- Breadcrumbs, `ArticleNav`, partage, citations, plots, TOC : comportement identique à l'existant.

### 3.4 Redirections 301
- Générées **au build** depuis le frontmatter par un helper (ex. `apps/site/lib/legacyRedirects.mjs`) consommé par `redirects()` dans `next.config.mjs` (approche recommandée : fonctionne en dev **et** via next-on-pages ; si une limite concrète apparaît, proposer l'alternative `_redirects` Cloudflare avec justification).
- Mapping par slug : `/articles/[slug]` → `/comprendre/[slug]` si `type: article`, sinon `/explorer/[slug]` ; `/projets/[slug]` → `/explorer/[slug]`.
- Index : `/articles` → `/explorer` · `/projets` → `/explorer`. (`/labo` est traité en PR2.)
- Les brouillons non publiés reçoivent aussi leur redirection (inoffensif, robuste pour l'avenir).

### 3.5 Réécriture des liens internes
- Inventorier **toutes** les occurrences de `/articles/…` et `/projets/…` dans : les markdown publiés (`public/articles/*.md`, `public/projets/*.md` — ex. le récit Réunion pointe vers `/projets/traversee-reunion`), les composants (`Footer`, `ProjectsGrid`, `RecentActivity`, `getRelated`, home…), `sitemap.js`, `buildSearchIndex.js`, `getRecentActivity.js`, la route `llms.txt`.
- **Présenter l'inventaire complet avant modification**, puis réécrire vers les nouvelles routes.

### 3.6 Navbar
- Desktop : `Comprendre` · `Explorer` · `Outils ▾` · `Le Lab ▾`. En PR1, `Outils ▾` contient « Locomotion Twin » (lien vers `/outils/twin` — la page arrive en PR2, donc **dans cette PR le menu Outils est présent mais désactivé/masqué**, activé en PR2 ; alternative : livrer PR1 et PR2 dans la même fenêtre de review si plus simple — proposer au plan). `Le Lab ▾` = À propos, Soutenir, Contact (Manifeste ajouté en PR2).
- Mobile : accordéons équivalents. Accessibilité : `aria-expanded`, navigation clavier, fermeture à l'échappement.
- La bannière live globale existante n'est pas touchée.

### 3.7 Cohérence des URL produites
- `buildSearchIndex.js`, `getRecentActivity.js`, `getRelated.js`, `sitemap.js`, `robots.js`, route `llms.txt` : toutes les URL émises pointent vers les nouvelles routes. Brouillons et cartes teaser exclus partout.

**Recette PR1** : `/comprendre` (carte respiration sans lien), `/explorer` (6 items, étiquettes, tri), un article de détail, un récit, un projet (notes, plots, replay intacts), 4-5 anciens slugs → 301 correcte, `/recherche` fonctionnelle avec les nouvelles URL, sitemap et llms.txt cohérents, mobile OK.

---

## 4. PR2 — Manifeste et Outils

### 4.1 `/manifeste`
- Page longue en `Prose`, structure en 5 sections avec placeholders : ① le constat (discordance évolutive) ② la réponse (robustesse ≠ performance maximale) ③ la méthode (comprendre en scientifique, utiliser en animal) ④ le laboratoire (N=1 assumé, incertitude honnête) ⑤ par où commencer (liens vers `/comprendre`, `/explorer`, `/outils/twin` + capture email). Corps : `[PROVISOIRE — texte n°2]` avec le plan de sections visible.
- Ajouter « Manifeste » en tête du menu `Le Lab ▾`. Redirection `/labo` → `/manifeste` (301) ; retirer la page `/labo`... **non** : conserver le fichier mais le remplacer par la redirection (règle n°8 : pas de suppression — utiliser `redirects()` et vider/neutraliser la page, proposer l'approche au plan).

### 4.2 `/outils`
- Index sobre : une carte « Locomotion Twin » (titre, une phrase, lien) + une ligne « D'autres instruments sont en construction au Lab. » Rien de daté, rien de promis.

### 4.3 `/outils/twin`
- Page teaser, **texte seul, wordmark actuel du Lab, aucun logo Twin** (hors-scope explicite).
- Structure : promesse en une phrase → « comment ça marche » en trois pas → **statut de calibration honnête** (encadré : « N athlètes · M courses · validation croisée sans fuite temporelle » — valeurs factices marquées `À REMPLACER`) → CTA « Rejoindre la cohorte de calibration » (lien `/contact` avec sujet pré-rempli si le formulaire le permet, sinon mailto) → capture email `source="twin"` (« Être prévenu·e au lancement »).
- Corps : `[PROVISOIRE — texte n°6]`.

**Recette PR2** : `/manifeste` rendu propre (desktop + mobile), `/labo` → 301, `/outils` et `/outils/twin` en ligne, menu `Le Lab ▾` complet, menu `Outils ▾` actif.

---

## 5. PR3 — Live

### 5.1 Page `/live`
- **Localiser la source d'état du direct** utilisée par la bannière live existante (probablement `packages/tracking` / `services/tracking-cache`) et la **réutiliser** — ne pas créer un second mécanisme. Si aucune source globale n'existe, proposer la plus légère.
- Deux états : **direct actif** → embed du live (`LiveTrackingLazy`) pleine page ; **sinon** → bloc « Prochain départ : Tour des Écrins en autonomie · 20–24 août 2026 · 194 km · ~12 000 m D+ » + une phrase + capture email `source="live"` (« Être prévenu·e du départ »).
- Bas de page, dans les deux états : cross-links curés (« À lire en attendant / pour aller plus loin » → le projet Journal d'aventures 2026, le récit Réunion, le récit Vercors-Drôme) + la **phrase pack**, discrète : « *Ce dispositif de suivi est conçu et développé au Lab. Il vous ferait envie pour vos propres aventures ? [Écrivez-moi](/contact).* »

### 5.2 Bloc Live en tête de `/explorer`
- Composant compact partageant la même source d'état : badge « EN DIRECT » + lien vers `/live` quand actif ; sinon « Prochain départ : Écrins · 20 août » + lien `/live`.

### 5.3 Cartels de provenance des anciens replays
- Inventorier les occurrences de `<postlivetracking …/>` / `<livetracking …/>` dans les markdown publiés. Le mécanisme de légende existe déjà (`remarkPostLiveTracking` : le paragraphe italique suivant devient la caption).
- Ajouter/compléter la légende de chaque ancien replay sur le modèle : « *Direct v1 (2025) — smartphone + Traccar, conservé tel quel.* » (année/aventure adaptées). **Présenter la liste des insertions avant édition** — ce sont des modifications de contenu.

### 5.4 Contrat d'archive (pour le chantier 2)
- Créer `docs/live-archive-schema.md` : schéma versionné d'un `archive.json` par aventure — `meta` (nom, dates, distance, D+), `positions[]`, `stats{}`, `journal[]` (entrées horodatées : texte, photo, audio), `chat[]` (messages du mur). Champs `journal` et `chat` optionnels et vides aujourd'hui. Documenter que les replays actuels (`public/replays/*`) sont antérieurs au schéma et le restent (pièces v1 exposées telles quelles).

**Recette PR3** : `/live` en état « prochain départ » correct, bloc live sur `/explorer`, cartels visibles sous les anciens replays, `docs/live-archive-schema.md` relu.

---

## 6. PR4 — Email : passerelle Brevo

### 6.1 `services/email-gateway` (nouveau, TypeScript)
- Worker Cloudflare : `POST /subscribe` avec `{ email, source }` (`source ∈ comprendre | twin | live | footer`). Validation basique de l'email, CORS restreint à `https://thelocomotionlab.com` (+ localhost en dev), réponses d'erreur propres, garde-fou anti-spam minimal (honeypot côté client + limite de débit simple si triviale à mettre en place).
- Appelle l'API Brevo **en double opt-in** (endpoint « create DOI contact ») avec l'attribut `SOURCE` et la liste cible. Variables : `BREVO_API_KEY` (secret wrangler), `BREVO_LIST_ID`, `BREVO_DOI_TEMPLATE_ID`, `DOI_REDIRECT_URL` — **aucune valeur dans le repo**.
- `wrangler.toml`, `README.md` du service (dev local via `wrangler dev`, déploiement).

### 6.2 Côté site
- Refactorer `NewsletterSignup` → `EmailCapture` : props `title`, `promise` (défaut : la micro-promesse, texte n°8), `source` ; réexport de compatibilité sous l'ancien nom. Endpoint via `NEXT_PUBLIC_EMAIL_ENDPOINT` (défaut : l'ancien Worker tant que la bascule n'est pas validée — la bascule est un changement d'env, pas de code).
- Remplacer les usages : footer (`source="footer"`), `/comprendre`, `/outils/twin`, `/live`.
- **Micro-promesse partout, à l'identique** : « Pas de newsletter. Un email quand quelque chose paraît ici. »

### 6.3 `docs/email-brevo-setup.md` — checklist manuelle pour Valentin
- Créer le compte Brevo, la liste « Le Lab », l'attribut de contact `SOURCE` ; créer le template de confirmation DOI en français ; générer la clé API et la poser en secret wrangler ; importer le Google Sheet existant avec `SOURCE = legacy` (sans DOI rétroactif : contacts historiques importés tels quels, base légale d'origine documentée) ; **note pour le chantier 2** : authentifier le domaine (SPF/DKIM) dans Brevo **avant** le premier envoi de campagne (annonce Écrins) ; mettre l'Apps Script à la retraite après validation de la bascule.

**Recette PR4** : depuis le site en local, une inscription de test crée un contact Brevo avec la bonne `SOURCE` et déclenche l'email DOI ; les quatre formulaires affichent la micro-promesse ; l'ancien flux reste fonctionnel tant que l'env n'a pas basculé.

---

## 7. PR5 — Home et cohérence finale

- **Hero** : la formule en titre — « Comprendre le corps comme un scientifique. L'utiliser comme un animal. » — sous-titre `[PROVISOIRE — texte n°1]`, CTA principal → `/manifeste`.
- Sections : dernières parutions (réutiliser `RecentActivity`), carte Locomotion Twin → `/outils/twin`, bloc live conditionnel (composant de la PR3), capture email en pied (déjà en place via footer).
- Vérifier titres/meta/OG de toutes les nouvelles pages (descriptions provisoires acceptées, marquées).
- **Mettre à jour la section « Arborescence » de `CLAUDE.md`** pour refléter la nouvelle IA (le fichier doit rester court et à jour).
- Balayage final : aucun lien interne mort (vérification systématique des href du site), recette complète.

**Définition de « fini » du chantier** : nav 4 entrées en production · chaque ancien slug répond en 301 vers sa nouvelle adresse · `/manifeste`, `/outils/twin`, `/live` en ligne avec leurs placeholders structurés · `/comprendre` avec sa carte « à paraître » et sa capture · un contact de test dans Brevo avec sa `SOURCE` · recherche, sitemap, `llms.txt` cohérents · `CLAUDE.md` à jour · builds et lint verts.

---

## 8. Textes — briefs des placeholders

Chaque placeholder est livré ainsi : le repère `[PROVISOIRE — texte n°X]`, le brief ci-dessous en commentaire au-dessus, et un court texte provisoire plausible en français (jamais de lorem ipsum). Récapituler la liste des textes à écrire dans la description de la PR concernée.

| n° | Texte | Longueur | Brief |
|----|-------|----------|-------|
| 1 | Sous-titre hero | 25–35 mots | Une phrase sur la quête (robustesse physiologique) + ce qu'on trouve ici |
| 2 | Manifeste | 1 200–1 800 mots | Les 5 sections du §4.1 |
| 3 | Intro Comprendre | 60–80 mots | Le contrat : sourcé, vulgarisé, relié au terrain — « à paraître » assumé |
| 4 | teaserText respiration | 1 phrase | Provisoire : « Article en cours d'écriture. » |
| 5 | Intro Explorer | 60–80 mots | Le terrain comme banc d'essai de la quête |
| 6 | Page Twin | 300–400 mots | Structure du §4.3, ton honnête et factuel |
| 7 | Bloc « prochain départ » | 40–60 mots | Écrins, autonomie, dates, invitation à laisser son email |
| 8 | Micro-promesse email | 1 phrase, fixe | « Pas de newsletter. Un email quand quelque chose paraît ici. » |
| 9 | Phrase pack live | 1 phrase, fixe | Voir §5.1 |
| 10 | Cartels de provenance | 1 phrase/replay | Modèle du §5.3 |

---

## 9. Hors-scope strict (ne pas faire, même si tentant)

- Logo Locomotion Twin, refonte graphique, nouvelles couleurs ou polices.
- L'app `apps/twin` et le moteur `services/twin-engine` : **intouchés**.
- Fonctionnalités du chantier 2 : journal Telegram, mur/chat, pronostic, OG dynamique, envois de campagnes Brevo, enrichissement des replays.
- Migration TypeScript du site, montée de versions de dépendances.
- Suppression de fichiers (Chianti / Lavaredo / GRF 2025 : gérés par Valentin).
- Toute exposition d'un contenu `published: false` au-delà de la carte teaser décrite en §3.1.

---

## 10. Démarrage

Commencer par la **PR1** : présenter le plan détaillé — approche des redirections, inventaire complet des liens internes à réécrire, liste des fichiers touchés, points de vigilance next-on-pages — puis **attendre la validation de Valentin** avant la première ligne de code.
