# Audit UX/UI du site — juillet 2026

> Audit réalisé sur le code de `apps/site` + `packages/ui` (branche `claude/ux-ui-audit-complete-olakne`).
> Périmètre : incohérences graphiques (UI), ergonomie & accessibilité (UX), responsive.
> Les ratios de contraste cités sont calculés selon la formule WCAG 2.x à partir des
> couleurs réelles du code (script : voir §Méthode en fin de document).
>
> **Statut (22/07/2026) : corrections appliquées** sur cette même branche.
> **C1 — décision finale de Valentin après essai des options A puis B :
> retour aux CTA d'origine (orange accent + texte blanc, ~1,9:1).**
> Non-conformité AA assumée sur ces boutons, au titre de l'identité visuelle ;
> les hovers restent unifiés dans la famille orange (accent-dark). Ne pas
> « re-corriger » sans son accord. **C2 — le token `--color-brand-accent-ink`
> a été ajusté de `#99610D` (jugé trop brun) à `#C08327`** : ocre doré au plus
> près de l'orange de marque qui tient ≥ 3:1 sur blanc et crème (seuil AA
> « grand texte » ; pas 4,5:1 — compromis assumé), renforcé par la graisse
> (semibold) sur les suites de « La philosophie ».
> **Harmonisation complémentaire (même session)** : anciennes pages (Quête,
> À propos, Mentions, Twin, Recherche, Soutenir) passées au motif
> `SectionHeading` (Lora italique + filet) ; Soutenir aligné à gauche sur le
> gabarit de lecture 3xl ; cartes Ateliers alignées sur les cartes
> Comprendre/Explorer (CardMeta, titre terracotta, image h-44, gap-6) ;
> largeur utile de Pratiquer et Recherche alignée sur Comprendre/Explorer
> (`lg:px-12` ≡ px-6 + retrait interne) ; page Inscription resserrée — un
> seul encadré sémantique (info/attention/erreur), arrondis réduits à
> full/xl/2xl, corps de texte 15 / 14,5 / étiquettes 11.
> Vérifié : `next build` (29 pages),
> `eslint`, `vitest` (21/21), `tsc` de email-gateway. Choix faits en appliquant :
> m13 → option « retirer le drag » du ShareButton ; M10 non appliqué à
> PhilosophieSection (texte justifié spécifié par le handoff, grille desktop
> uniquement). Restent en suivi : m1 (échelle typographique — décision de design),
> et quelques survols orange hors périmètre de l'audit (Breadcrumb, ArticleNav,
> lien « Écrivez-moi » de /live, indicateur live).

---

## 1. Résumé global

### Ce qui va bien (et qu'il faut garder)

- **L'architecture du design system est saine** : les couleurs, polices et ombres vivent dans
  `packages/ui/src/styles/theme.css` (source unique), les polices Ubuntu/Lora sont chargées
  proprement via `next/font`, et le site les consomme via des classes `brand-*`.
- **De vrais réflexes d'accessibilité déjà en place**, rares sur un site de cette taille :
  lien d'évitement « Aller au contenu principal », styles de focus clavier globaux,
  `prefers-reduced-motion` respecté, menus déroulants au clavier (`aria-expanded`,
  flèches, Échap), `aria-current="page"`, zones de statut `aria-live` sur tous les
  formulaires, honeypots anti-spam, breadcrumb sémantique.
- **Les images sont bien gérées** : quasi toutes les images ont un `alt` descriptif, les
  images décoratives ont `alt=""` + `aria-hidden`, `next/image` avec `sizes` est utilisé
  partout où c'est possible.
- **Le responsive est pensé page par page** (grilles qui passent en 1 colonne, accordéon
  mobile de la Philosophie, carrousel vertical mobile / horizontal desktop) — pas de
  problème structurel de débordement détecté.

### Ce qui ne va pas

1. **Le problème n°1, systémique : le contraste des couleurs.** La palette de la charte
   (orange `#EFB159`, bleu-vert `#8CB9BD`…) est pastel. Utilisée en **fond décoratif**, elle
   est très bien. Utilisée comme **couleur de texte ou de bouton**, elle est illisible pour
   une partie des visiteurs : le bouton principal du site (blanc sur orange) est à **1,9:1**
   alors que la norme demande **4,5:1**. Ce motif se répète sur ~20 endroits (navigation
   active, titres d'articles, résultats de recherche, liens…).
2. **Le design system existe mais n'est presque pas utilisé.** Le composant `Button` de la
   charte n'est utilisé que par le formulaire de contact ; toutes les autres pages
   recodent leur bouton à la main, avec **4 comportements de survol différents** pour le
   même bouton orange. Le formulaire d'inscription aux ateliers utilise **7 couleurs codées
   en dur hors charte**, dont une (`#D89A2E`) quasi identique au token officiel
   (`#D89A3D`) — exactement la dérive que la règle « une couleur se change à un seul
   endroit » devait empêcher.
3. **Des liens invisibles dans le texte.** Dans les articles et les pages À propos/Contact,
   les liens sont du texte gris en gras, sans soulignement ni couleur : on ne peut pas
   deviner qu'ils sont cliquables.
4. **Une inflation de valeurs arbitraires** (27 tailles de police différentes, 11 arrondis,
   ombres recodées à la main à côté des tokens existants) qui rend le site de plus en plus
   dur à maintenir cohérent.

**En une phrase : le socle est très bon, mais il faut (a) assombrir les couleurs quand elles
servent de texte, (b) faire converger les boutons/liens vers le composant partagé, (c)
arrêter les couleurs codées en dur.**

---

## 2. Anomalies CRITIQUES 🔴

> **C'est quoi le « contraste WCAG » ?** C'est le rapport de luminosité entre un texte et
> son fond, de 1:1 (invisible) à 21:1 (noir sur blanc). La norme d'accessibilité (WCAG,
> niveau AA) demande **4,5:1 minimum** pour du texte normal et **3:1** pour du texte
> « large » (≥ 24 px, ou ≥ 18,5 px en gras). En dessous, une partie des visiteurs
> (malvoyants, écran au soleil, luminosité basse) ne lit tout simplement pas.

### C1. Le bouton principal du site est à 1,9:1 (blanc sur orange) — partout

**Problème.** Tous les CTA (« call to action », les boutons d'action principaux) du site
sont en texte **blanc sur orange `brand-accent`** : ratio mesuré **1,89:1** (minimum requis :
4,5:1). Ce sont précisément les boutons dont dépend la conversion : « La quête du labo »
(hero), « Voir tout » ×2 (accueil), « M'inscrire » (toutes les captures email), « Je réserve
ma place » (ateliers), « Je valide mon inscription » (inscription), « Rejoindre la cohorte »
(Twin), « Retour à Comprendre » (articles), bande email de l'accueil (titre + messages
d'état blancs sur orange).

**Fichiers concernés.**
- `packages/ui/src/components/Button.tsx:15` (variante `primary`)
- `apps/site/app/page.js:250`, `284`, `295`, `364-388`
- `apps/site/components/EmailCapture.jsx:145-146`
- `apps/site/components/AtelierCard.jsx:32-33`
- `apps/site/components/inscription/InscriptionForm.jsx:434`, `881-882`
- `apps/site/components/ArticleBody.jsx:156`
- `apps/site/app/outils/twin/page.jsx:87`, `apps/site/app/outils/page.jsx:63`
- `apps/site/components/SoutenirSection.jsx:102`

**Correction.** Deux options qui gardent l'identité orange :

- **Option A (recommandée) : texte foncé sur orange.** `#333` sur `#EFB159` = **6,7:1** ✓.
  Dans `Button.tsx` :

  ```diff
  const VARIANTS = {
  -  primary: "bg-brand-accent text-white shadow hover:bg-brand-primary-dark",
  +  primary: "bg-brand-accent text-brand-text shadow hover:bg-brand-accent-light",
  ```

- **Option B : garder le texte blanc mais foncer le fond.** Blanc sur `brand-deep-dark`
  (`#9A6044`) = **5,1:1** ✓ : `bg-brand-deep-dark text-white hover:bg-brand-deep`.

Puis répercuter la même combinaison sur chaque bouton listé ci-dessus (ou mieux : voir M1,
les remplacer par le composant `Button`). Pour la bande email de l'accueil
(`app/page.js:370-375`), passer le titre et la micro-promesse en `text-brand-text` /
`text-brand-text/85`, et les messages de succès/erreur du variant `band`
(`EmailCapture.jsx:171`, `182`) en `text-brand-text` également.

### C2. La couleur d'accent utilisée comme couleur de texte : ~1,9:1 sur une vingtaine d'endroits

**Problème.** L'orange `brand-accent` et les pastels de la charte servent de couleur de
*texte* sur fond clair. Ratios mesurés :

| Usage | Couleur | Ratio | Requis |
|---|---|---|---|
| Lien actif/survol de la **navigation principale** | `brand-accent` sur blanc | **1,89** | 4,5 |
| **Titres h3/h4 des articles** (`.prose`) | `brand-accent` sur blanc | **1,89** | 4,5 |
| **Titres h1 des articles** (`.prose`) | `brand-primary` sur blanc | **2,15** | 3 (large) |
| **Titres des résultats de recherche** | `brand-accent` sur blanc | **1,89** | 4,5 |
| Titres « Être prévenu·e… » (Comprendre, Quête, Twin, Soutenir) | `brand-accent` sur crème | **1,83** | 4,5 |
| « La philosophie » — suites en italique | `brand-accent` sur crème | **1,83** | 4,5 |
| Méta des cartes (« · EN COURS », prix ateliers) | `brand-accent-dark`, 11 px | **2,44** | 4,5 |
| Lien « ÊTRE PRÉVENU·E… » du registre (accueil) | `brand-accent-dark`, 11 px | **2,44** | 4,5 |
| Liens pied de « La philosophie » | `brand-primary-dark` | **2,94** | 4,5 |
| Étiquettes « ATELIER », « EN FORMATION » (10-11 px) | `brand-primary` | **2,08–2,15** | 4,5 |

**Fichiers concernés.**
- `apps/site/components/Navbar.jsx:151-153`, `157-159`, `184-186`, `330-332`, `336-338`
- `apps/site/app/globals.css:215-231` (couleurs des titres `.prose`)
- `apps/site/app/recherche/SearchClient.jsx:195`, `228`
- `apps/site/app/comprendre/page.jsx:193`, `apps/site/app/quete/page.jsx:158`,
  `apps/site/app/outils/twin/page.jsx:94`, `apps/site/components/SoutenirSection.jsx:73`
- `apps/site/components/PhilosophieSection.jsx:56-57`, `88-90`, `139-141`
- `apps/site/components/CardMeta.jsx:16`, `apps/site/app/page.js:169-176`
- `apps/site/app/pratiquer/page.jsx:187-189`, `apps/site/components/AtelierCard.jsx:193`
- `apps/site/components/Tooltip.jsx:101` (`text-brand-primary`)

**Correction recommandée (systémique).** Ajouter à la charte une déclinaison « encre » de
l'accent, réservée au texte sur fond clair, dans
`packages/ui/src/styles/theme.css` (+ miroir `tokens.ts`) :

```css
/* Accent utilisable en TEXTE sur fond clair (≥ 4,5:1 sur blanc et crème) */
--color-brand-accent-ink: #99610D;
```

Puis remplacer, dans les fichiers listés :
- `text-brand-accent` / `text-brand-accent-dark` (en texte) → `text-brand-accent-ink` ;
- les titres `.prose` dans `globals.css` :

  ```diff
  .prose h1 {
  -  color: var(--color-brand-primary);
  +  color: var(--color-brand-slate-dark);   /* 4,85:1 — cohérent avec les h1 de pages */
  }
  .prose h3, .prose h4, .prose h5, .prose h6 {
  -  color: var(--color-brand-accent);
  +  color: var(--color-brand-accent-ink);
  }
  ```
- les étiquettes `text-brand-primary` (10-11 px) → `text-brand-slate-dark` (4,85:1 ✓) ;
- les liens `text-brand-primary-dark` → `text-brand-slate-dark` ;
- nav active : `text-brand-accent` → `text-brand-accent-ink` (l'icône peut rester accent,
  c'est le *texte* qui doit passer le seuil).

### C3. Formulaire d'inscription ateliers : 7 couleurs codées en dur, hors charte

**Problème.** `InscriptionForm.jsx` n'utilise pas la charte : `#2F6F73` (≈ 40 occurrences),
`#D89A2E` (≈ 20), `#3F8F5B`, `#A8A29A`, `#DCE7E8`, `#D9CDB8`, `#E3DACA`. Deux dérives
concrètes : `#D89A2E` est un **quasi-doublon** du token officiel `brand-accent-dark`
(`#D89A3D`) — impossible à distinguer à l'œil, mais toute évolution future de la charte ne
s'appliquera pas ici ; et `#D89A2E` en texte sur crème est à **2,37:1** (astérisques
obligatoires, labels « CONTACT D'URGENCE », prix). C'est la violation directe de la règle du
repo : « La charte vient de `packages/ui` et de nulle part ailleurs ».

**Fichier concerné.** `apps/site/components/inscription/InscriptionForm.jsx`
(lignes 40, 43, 49, 56, 321-324, 346, 360-375, 391-421, 460, 483-494, 545, 595, 617-629,
648, 676-685, 709-744, 756-764, 802-835, 879).

**Correction.**
1. Promouvoir dans la charte ce qui mérite de l'être (`theme.css`) — le `#2F6F73` du
   prototype est d'ailleurs *plus accessible* (5,6:1) que le `brand-slate-dark` officiel
   (4,85:1), signe que le handoff a foncé la couleur pour la lisibilité :

   ```css
   --color-brand-success: #3F8F5B;   /* confirmation d'inscription */
   ```
2. Remplacer dans le fichier : `#2F6F73` → `text-brand-slate-dark` (ou aligner le token
   slate-dark sur `#2F6F73` dans la charte, décision de design à prendre une fois) ;
   `#D89A2E` → `brand-accent-dark` pour les fonds/bordures, `brand-accent-ink` (cf. C2)
   pour le texte ; `#3F8F5B` → `brand-success` ; `#E3DACA` → `brand-gauge-full` ;
   `#DCE7E8` → `brand-wash-line` ; `#D9CDB8` → `brand-hairline` ;
   `placeholder:text-[#A8A29A]` → `placeholder:text-gray-500`.
3. Même nettoyage dans `ContactForm.jsx:85-94` (email HTML : `#EFB159` codé en dur, à
   importer depuis `@locomotionlab/ui` → `brandColors.accent`).

### C4. Focus clavier supprimé sur le CTA de la page Outils

**Problème.** Le bouton « Découvrir » porte `focus-visible:outline-none`, ce qui **annule
le style de focus global** : un visiteur qui navigue au clavier (Tab) ne voit plus du tout
où il est rendu sur cette page. Supprimer l'indicateur de focus sans remplacement est un
échec direct du critère WCAG 2.4.7.

**Fichier concerné.** `apps/site/app/outils/page.jsx:63`.

**Correction.**

```diff
-  className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
+  className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-brand-text font-semibold shadow-cta hover:opacity-90"
```

(Au passage : `shadow-cta shadow-lg` sont deux utilitaires d'ombre concurrents — n'en
garder qu'un, cf. m7.)

---

## 3. Anomalies MODÉRÉES 🟠

### M1. Un design system de boutons existe… et chaque page recode le sien

**Problème.** Le composant `Button` (`packages/ui`) n'est importé que par `ContactForm`.
Résultat : le même bouton orange existe avec **4 survols différents** selon la page —
il devient bleu-vert (`hover:bg-brand-primary-dark` — accueil, articles, Twin), il devient
orange foncé (`hover:bg-brand-accent-dark` — ateliers, inscription), il devient
semi-transparent (`hover:opacity-90` — EmailCapture, Outils, Soutenir), et des géométries
différentes (`py-3` / `py-3.5` / `py-[11px]` / `px-[26px]`, `text-[15px]` / `[15.5px]` /
`[16.5px]`…). Le survol « orange → bleu-vert » est en outre surprenant : un bouton qui
change de famille de couleur au survol ressemble à un autre bouton.

**Fichiers concernés.** Ceux listés en C1 + `packages/ui/src/components/Button.tsx:14-19`.

**Correction.**
1. Fixer le comportement de référence dans `Button.tsx` (une seule famille de couleur) :

   ```diff
   const VARIANTS = {
   -  primary: "bg-brand-accent text-white shadow hover:bg-brand-primary-dark",
   +  primary: "bg-brand-accent text-brand-text shadow hover:bg-brand-accent-light",
   -  secondary: "bg-transparent border border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-white",
   +  secondary: "bg-transparent border border-brand-accent-dark text-brand-accent-ink hover:bg-brand-accent hover:text-brand-text",
   ```
2. Remplacer progressivement les boutons faits main par `<Button as={Link} …>` (le
   composant accepte déjà `as`), en commençant par les pages à fort trafic (accueil,
   ateliers). Une seule correction de couleur profitera alors à tout le site.

### M2. Liens invisibles dans le corps de texte

**Problème.** Dans les articles, les pages À propos, Contact et Mentions légales, les liens
sont stylés `font-semibold text-gray-800 hover:underline` : **rien ne les distingue du
texte en gras** tant qu'on ne les survole pas (et au doigt, sur mobile, on ne survole
jamais). Un lien doit être identifiable sans interaction (WCAG 1.4.1).

**Fichiers concernés.**
- `apps/site/components/ArticleBody.jsx:125-142` (tous les liens des articles/récits)
- `apps/site/components/Citation.jsx:39`
- `apps/site/app/about/page.jsx:50`, `apps/site/components/ContactForm.jsx:136`,
  `apps/site/app/mentions-legales/page.jsx:48`, `90`

**Correction.** Ajouter un soulignement permanent + une couleur de lien accessible :

```diff
-  className="font-semibold hover:underline"
+  className="font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark"
```

(`brand-deep-dark` sur blanc = 5,1:1 ✓ ; le filet ocre garde l'identité de la charte.)

### M3. Le plugin typographie n'est pas chargé : des classes `prose-*` mortes, citations non stylées

**Problème.** `tailwind.config.mjs` le documente lui-même : le plugin `@tailwindcss/typography`
n'est **pas** injecté (pas de `@config` ni `@plugin` dans `globals.css`). Toutes les classes
`prose-lg`, `prose-img:*`, `prose-blockquote:*` d'`ArticleBody.jsx:103-108` sont donc
**générées pour rien** — en particulier les *blockquotes* des récits (utilisées dans
`grf-2025.md`, `lavaredo-2025.md`, `chianti-2025.md`) s'affichent avec le style navigateur
par défaut, sans le liseré bleu ni l'italique prévus.

**Fichiers concernés.** `apps/site/components/ArticleBody.jsx:101-110`,
`apps/site/app/globals.css`.

**Correction.** Rester sur l'approche actuelle (CSS maison, comportement maîtrisé) mais la
compléter : supprimer les variantes mortes du JSX et ajouter le style réel dans
`globals.css` :

```css
/* Citations (blockquote markdown) dans les articles/récits */
.prose blockquote {
  margin: 1.5rem 0;
  border-left: 4px solid var(--color-brand-primary);
  padding-left: 1rem;
  font-style: italic;
  color: var(--color-gray-600, #4b5563);
}
```

```diff
-            prose prose-lg max-w-none
+            prose max-w-none
             font-lora text-gray-800 leading-relaxed
             text-left md:text-justify
-            prose-img:rounded-lg prose-img:shadow-md prose-img:mx-auto prose-img:my-6
-            prose-blockquote:italic prose-blockquote:text-gray-600
-            prose-blockquote:border-l-4 prose-blockquote:border-brand-primary prose-blockquote:pl-4
             article-body
```

### M4. Formules mathématiques : débordement horizontal probable sur mobile

**Problème.** Les articles/projets peuvent contenir des formules KaTeX
(`saison-trail-2026.md` en contient). Un bloc `.katex-display` plus large que l'écran
**pousse toute la page en défilement horizontal** sur mobile — c'est le seul risque de
débordement détecté. Aucune règle CSS ne le contient aujourd'hui.

**Fichier concerné.** `apps/site/app/globals.css`.

**Correction.**

```css
/* Formules : défilement interne plutôt que débordement de la page */
.prose .katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 0.25rem;
}
```

### M5. Messages de statut des formulaires : hauteur figée → chevauchement

**Problème.** La zone de statut d'`EmailCapture` est `h-6` (24 px fixes). Le message de
succès de la passerelle (« Merci ! Un email de confirmation vient de t'être envoyé — pense
à cliquer le lien. ») tient sur **2 lignes sur mobile** (~40 px) : le texte déborde du bloc
et vient chevaucher/toucher ce qui suit. Même motif dans `SoutenirSection`.

**Fichiers concernés.** `apps/site/components/EmailCapture.jsx:163`,
`apps/site/components/SoutenirSection.jsx:113`.

**Correction.** Hauteur *minimale* au lieu de fixe (garde l'anti-« saut de page ») :

```diff
-      <div id={statusId} className="h-6 mt-2 text-center" aria-live="polite" …>
+      <div id={statusId} className="min-h-6 mt-2 text-center" aria-live="polite" …>
```

### M6. Hiérarchie des titres : sauts de niveaux

**Problème.** Les lecteurs d'écran naviguent de titre en titre ; un saut h1 → h3 désoriente.
- Page Comprendre : h1 → cartes en **h3** (aucun h2) — `app/comprendre/page.jsx:95`, `144` ;
- Page Soutenir : h1 → « Comment soutenir ? » en **h3**, « Stay tuned ! » en **h4** —
  `components/SoutenirSection.jsx:59`, `73`.

**Correction.**
- Comprendre : insérer un titre invisible avant la grille :

  ```jsx
  <h2 className="sr-only">Tous les articles</h2>
  ```
  (ou passer les titres de cartes en `h2` — les deux sont valides).
- Soutenir : passer le h3 et le h4 en `h2` (le style visuel ne change pas, les classes
  restent) :

  ```diff
  -        <h3 className="text-xl font-semibold mb-3 text-brand-deep">
  +        <h2 className="text-xl font-semibold mb-3 text-brand-deep">
  ...
  -        <h4 className="text-lg font-semibold mb-3 text-brand-accent">
  +        <h2 className="text-lg font-semibold mb-3 text-brand-accent-ink">
  ```

### M7. Soutenir : formulaire email recodé à la main, sans honeypot ni `source`

**Problème.** `SoutenirSection` duplique le JSX et la logique d'`EmailCapture` au lieu de
l'utiliser : du coup **pas de honeypot anti-robots**, pas de `source` transmise à la
passerelle (impossible de savoir que l'inscription vient de /soutenir), et un point de
divergence de style de plus à maintenir.

**Fichier concerné.** `apps/site/components/SoutenirSection.jsx:8-127`.

**Correction.** Remplacer tout le bloc formulaire + statut (lignes 81-127) par :

```jsx
<EmailCapture
  title={null}
  description={null}
  source="soutenir"
  placeholder="Votre adresse e-mail"
  buttonLabel="M'inscrire"
/>
```

(et supprimer `useState`/`handleSubmit` devenus inutiles — le composant peut même
redevenir un Server Component).

### M8. Boutons « radio » du droit à l'image : motif ARIA incomplet

**Problème.** Le choix « J'autorise / Je n'autorise pas » est fait de `<button
role="radio">` dans un `role="radiogroup"`. Or le motif radio ARIA implique la navigation
aux **flèches** avec un seul stop Tab ; ici rien n'est câblé, l'utilisateur de lecteur
d'écran entend « bouton radio » mais les flèches ne font rien. Deux vrais
`<input type="radio">` stylés font tout ça gratuitement (clavier, annonce, groupement).

**Fichier concerné.** `apps/site/components/inscription/InscriptionForm.jsx:716-749`.

**Correction (structure).**

```jsx
<fieldset>
  <legend className="sr-only">Droit à l'image</legend>
  <label className={cardClasses(image === true)}>
    <input
      type="radio" name="image" value="oui" className="sr-only"
      checked={image === true} onChange={() => setImage(true)}
    />
    {/* pastille + libellé existants inchangés */}
  </label>
  <label className={cardClasses(image === false)}>
    <input
      type="radio" name="image" value="non" className="sr-only"
      checked={image === false} onChange={() => setImage(false)}
    />
    …
  </label>
</fieldset>
```

### M9. Lignes « À VENIR » du registre (accueil) : texte estompé sous le seuil de lisibilité

**Problème.** Les lignes non cliquables du registre combinent `opacity-65` **et**
`text-gray-500` sur la petite typo mono 10-11 px : contraste effectif ≈ **2,6:1**. On veut
les estomper, mais elles portent une vraie info (thème, statut).

**Fichier concerné.** `apps/site/app/page.js:118-119` (+ badge ligne 71).

**Correction.** Estomper moins, et sur une base plus foncée :

```diff
-      : "opacity-65"
+      : "opacity-80"
```
et dans `REGISTRE_BADGES.aVenir` : `text-gray-500` → `text-gray-600`.

### M10. Texte justifié sur mobile (Quête, À propos, Mentions légales, Philosophie)

**Problème.** `text-justify` sur une colonne étroite crée des « rivières » d'espaces qui
fatiguent la lecture (l'`hyphens-auto` aide, mais pas assez sous ~400 px). Les articles ont
d'ailleurs déjà le bon réglage (`text-left md:text-justify`) — ces pages non.

**Fichiers concernés.** `apps/site/app/quete/page.jsx:47`, `apps/site/app/about/page.jsx:35`,
`apps/site/app/mentions-legales/page.jsx:35`, `apps/site/components/PhilosophieSection.jsx:142`.

**Correction.** Remplacer `text-justify` par `text-left md:text-justify` (et garder
`hyphens-auto`).

### M11. Deux « SectionHeading » presque identiques mais pas tout à fait

**Problème.** Le même motif « titre Lora italique terracotta + filet » est implémenté deux
fois : Pratiquer (`text-[23px]`, filet `bg-brand-hairline`) et Explorer/Live (`text-[24px]`,
filet `bg-gray-300/80`, `translate-y-[2px]`). À l'œil, les pages n'ont pas exactement le
même titre de section — et la prochaine retouche devra être faite deux fois.

**Fichiers concernés.** `apps/site/app/pratiquer/page.jsx:83-92`,
`apps/site/components/ExplorerSections.jsx:24-36`, `apps/site/app/live/page.jsx:67-75`.

**Correction.** Extraire un composant unique `apps/site/components/SectionHeading.jsx` :

```jsx
export default function SectionHeading({ children, className = "" }) {
  return (
    <div className={`flex items-baseline gap-3.5 md:gap-5 ${className}`}>
      <h2 className="flex-none font-lora text-2xl font-medium italic text-brand-deep md:text-[28px]">
        {children}
      </h2>
      <div className="h-px flex-1 bg-brand-hairline" aria-hidden="true" />
    </div>
  );
}
```

et l'utiliser aux trois endroits (une seule taille : `text-2xl` = 24 px).

### M12. FAQ Pratiquer : double filet entre les deux dernières questions

**Problème.** Les questions 4 et 5 portent toutes deux `border-b border-t` : entre elles,
les deux bordures se cumulent en un double trait — les autres séparations sont simples.

**Fichier concerné.** `apps/site/app/pratiquer/page.jsx:232`, `241`.

**Correction.** Supprimer `border-b` de la question 4 (ligne 232) :

```diff
-            <details className="border-b border-t border-brand-hairline py-3 md:py-[13px]">
+            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
               <summary …>Je peux venir accompagné·e ?</summary>
```

(Plus robuste : mettre `divide-y divide-brand-hairline border-y border-brand-hairline` sur
le conteneur `flex flex-col` et retirer toutes les bordures des `<details>`.)

### M13. Bouton verrouillé de l'inscription : libellé illisible (1,4:1)

**Problème.** Tant que les consignes n'ont pas été lues, le bouton affiche du **blanc sur
beige `#E3DACA`** : 1,39:1 — on ne lit pas « Je valide mon inscription ». (Les éléments
désactivés sont exemptés de la norme, mais l'utilisateur doit quand même comprendre ce que
fera le bouton.)

**Fichier concerné.** `apps/site/components/inscription/InscriptionForm.jsx:877-883`.

**Correction.**

```diff
                 submitLocked
-                  ? "cursor-not-allowed bg-[#E3DACA]"
+                  ? "cursor-not-allowed bg-brand-gauge-full text-brand-text/50"
```

### M14. Infobulle des citations : sort de l'écran sur mobile

**Problème.** Le `Tooltip` des références scientifiques est une boîte de `w-80` (320 px)
centrée sous le numéro (`left-1/2 -translate-x-1/2`), sans détection des bords : pour une
citation proche du bord de l'écran, la moitié de la fiche sort du viewport sur mobile.

**Fichier concerné.** `apps/site/components/Tooltip.jsx:73-77`.

**Correction minimale.**

```diff
-            p-4 w-80 max-w-xs top-7 left-1/2 -translate-x-1/2
+            p-4 w-80 max-w-[min(20rem,calc(100vw-2rem))] top-7 left-1/2 -translate-x-1/2
```

(et, si le débordement persiste à gauche/droite, envisager une lib de positionnement type
Floating UI — hors périmètre de ce correctif.)

---

## 4. Anomalies MINEURES 🟡

### m1. 27 tailles de police arbitraires

Le code utilise `text-[9px]`, `[10px]`, `[10.5px]`, `[11px]`, `[11.5px]`, `[12px]`,
`[12.5px]`, `[13px]`, `[13.5px]`, `[14px]`, `[14.5px]`, `[15px]`, `[15.5px]`, `[16.5px]`,
`[17px]`, `[17.5px]`, `[18px]`, `[18.5px]`, `[21px]`, `[22px]`, `[23px]`, `[24px]`,
`[26px]`, `[28px]`, `[30px]`, `[40px]`, `[64px]` — en plus de l'échelle Tailwind. Une
échelle typographique resserrée (par ex. 11 / 13 / 14 / 16 / 18 / 21 / 24 / 28 / 40 / 64,
déclarée en tokens `--text-*` dans `theme.css`) rendrait la cohérence automatique.
*Correction : définir les tokens dans `packages/ui/src/styles/theme.css` et remplacer au
fil de l'eau ; à minima, ne plus introduire de nouvelle valeur arbitraire.*

### m2. 11 arrondis différents

`rounded` (4 px), `rounded-[3px]`, `rounded-md`, `rounded-lg`, `rounded-[10px]`,
`rounded-[11px]`, `rounded-xl`, `rounded-[14px]`, `rounded-2xl`, `rounded-[18px]`,
`rounded-full`. Les cartes de contenu hésitent entre `rounded-xl` (article, Twin) et
`rounded-2xl` (piliers, ateliers, Soutenir). *Correction : trancher — cartes = `rounded-2xl`,
champs = `rounded-xl`, pilules/CTA = `rounded-full` — et corriger
`ArticleBody.jsx:67`, `outils/twin/page.jsx:50`, `ArticleNav.jsx:36`.*

### m3. Les tokens d'ombre existent mais sont contournés

`--shadow-card` et `--shadow-cta` sont définis dans la charte, mais l'accueil recode
`shadow-[0_6px_24px_rgba(0,0,0,0.1)]` (`app/page.js:153`) et
`shadow-[0_6px_18px_rgba(0,0,0,0.15)]` (`app/page.js:284`, `295`), l'inscription
`shadow-[0_6px_24px_rgba(0,0,0,0.06)]` (`InscriptionForm.jsx:317`, `657`, `796`).
*Correction : utiliser `shadow-card` / `shadow-cta`, et si le rendu du handoff diffère
vraiment, ajuster le token (un seul endroit).*

### m4. Trois « couleurs de texte par défaut » cohabitent

Le `<body>` est en `gray-700` (`#374151`, posé deux fois : `layout.js:51` **et**
`globals.css:30`), la charte définit `brand-text` (`#333333`), et Quête/À
propos/Mentions/Twin repassent en `text-gray-800` (`#1f2937`). Aucun n'est illisible, mais
le gris du corps de texte varie d'une page à l'autre. *Correction : choisir `brand-text`
comme défaut (`layout.js` : `text-brand-text`, supprimer la couleur dans `globals.css`) et
retirer les `text-gray-800` locaux.*

### m5. Dans un même article, listes et paragraphes n'ont pas la même taille

`.article-body p` = 1,18 rem / interligne 1,7, mais `.prose ul, .prose ol` = 1 rem /
interligne 1,5 (`globals.css:500-509` vs `570-576`) : dans un article, chaque liste paraît
« rétrécie ». *Correction : aligner les listes sur `font-size: 1.18rem; line-height: 1.7;`
dans le contexte `.article-body`.*

### m6. « Stay tuned ! » et une casse de tagline incohérente

Le titre par défaut d'`EmailCapture` et celui de la page Soutenir sont en anglais sur un
site 100 % francophone (`EmailCapture.jsx:29`, `SoutenirSection.jsx:74`) ; la tagline de la
page Outils est en minuscules (« les outils du labo », `outils/page.jsx:44`) là où toutes
les autres sont des phrases capitalisées. *Correction : « Restez à l'écoute ! » (ou « Suivre
le labo ») et « Les instruments du labo. ».*

### m7. Classes en conflit / redondantes

`shadow-cta shadow-lg` (deux ombres concurrentes, `outils/page.jsx:63`) ;
`aria-hidden` manquant sur l'icône `<Mail>` de `SoutenirSection.jsx:108` (elle est purement
décorative — l'ajouter comme dans `EmailCapture.jsx:150`).

### m8. Placeholders trop pâles

`placeholder:text-gray-400` (2,5:1) sur les champs ateliers/inscription
(`AtelierCard.jsx:30`, `InscriptionForm.jsx:40`). *Correction :
`placeholder:text-gray-500` (4,8:1), qui reste visuellement « placeholder ».*

### m9. Focus des champs : trois styles différents

Champ charte = anneau accent (`Field.tsx:41`), bande email = anneau `brand-deep`
(`EmailCapture.jsx:118`), inscription = outline `brand-primary`
(`InscriptionForm.jsx:40`). *Correction : un seul style (celui de `Field`), sauf cas
justifié par le fond (la bande orange justifie le sien — le documenter en commentaire, ce
qui est déjà fait).*

### m10. Recherche : soulignage des correspondances peu visible et pas de bouton « Rechercher »

Le terme trouvé est mis en gras gris (`SearchClient.jsx:57`) — quasi invisible dans un
extrait déjà gris ; et ni la barre de recherche de la navbar ni la page /recherche n'ont de
bouton de soumission visible (validation à la touche Entrée uniquement). *Correction :
réutiliser le style existant `mark.search-highlight` (`globals.css:636`) pour les extraits
(`<mark class="search-highlight">$1</mark>`), et ajouter un petit bouton icône loupe
`type="submit"` avec `aria-label="Lancer la recherche"` dans les deux formulaires.*

### m11. Message d'erreur trompeur en cas de panne réseau

« Une erreur est survenue. Vérifie ton adresse mail. » s'affiche aussi quand c'est le
serveur/réseau qui est en cause (`EmailCapture.jsx:185`, `SoutenirSection.jsx:124`,
`AtelierCard.jsx:312`) : l'utilisateur corrige une adresse qui était bonne. *Correction :
« L'envoi a échoué. Vérifie ta connexion et réessaie. » (le formulaire d'inscription fait
déjà la distinction, s'en inspirer).*

### m12. Tailles de texte 9 px dans le live

`text-[9px]` (`live/JournalCard.jsx:85`, `live/ProfileCard.jsx:115`,
`live/LiveTermine.jsx:182`) : à la limite du lisible sur mobile, sous le plancher
raisonnable de 10-11 px pour des étiquettes. *Correction : remonter à `text-[10px]`/`text-xxs`
(le token `--text-xxs: 0.625rem` = 10 px existe déjà dans la charte, autant s'en servir).*

### m13. Bouton de partage : drag mobile non standard

Le déplacement du bouton flottant exige un appui long de 2 s (non découvrable, aucun
indice visuel) et `e.preventDefault()` dans `onTouchMove` est inopérant en React (écouteurs
passifs) → le scroll de la page se déclenche pendant le drag (`ShareButton.jsx:60-126`).
*Correction : soit retirer le drag (peu d'usage réel), soit le refaire avec les Pointer
Events (`onPointerDown/Move/Up` + `setPointerCapture`) et `touch-action: none` sur le
bouton pendant le drag.*

### m14. Titres `.prose` : police dupliquée au lieu du token

`globals.css:210` réécrit `font-family: var(--next-font-ubuntu), ui-sans-serif, system-ui`
au lieu de `var(--font-heading)` (déjà défini dans la charte) : si la police de titres
change un jour dans `theme.css`, les titres d'articles ne suivront pas. *Correction :
`font-family: var(--font-heading);`.*

---

## 5. Ce qu'il faut retenir (plan d'action suggéré)

1. **Lot « contraste » (critique, ~1 journée)** : ajouter `--color-brand-accent-ink` (et
   `--color-brand-success`) à la charte, corriger `Button.tsx`, puis balayer les
   occurrences listées en C1/C2/C3/C4. C'est le plus gros gain d'accessibilité et de
   lisibilité du site, sans rien changer à son identité visuelle.
2. **Lot « boutons & liens » (modéré)** : basculer les CTA sur le composant `Button`,
   souligner les liens dans le texte (M1, M2).
3. **Lot « finitions » (modéré/mineur)** : M3 → M14 puis les mineurs, au fil des passages
   dans chaque fichier.

## Méthode

- Lecture exhaustive de `packages/ui` et des pages/composants de `apps/site` (layout,
  globals.css, 15 pages, ~30 composants dont les formulaires et le live).
- Recherches transversales : couleurs hexadécimales codées en dur, `<img>` sans `alt`,
  valeurs Tailwind arbitraires, `whitespace-nowrap`/largeurs fixes, tableaux et formules
  dans le contenu markdown.
- Ratios de contraste calculés par script (formule de luminance relative WCAG 2.x) sur
  les combinaisons réellement présentes dans le code ; seuils AA : 4,5:1 (texte normal),
  3:1 (texte large ≥ 24 px ou ≥ 18,5 px gras).
