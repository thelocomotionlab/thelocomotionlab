# Studio v2 — Plan de refonte

**Audit, spécification et plan de réalisation pour Claude Code — Claude Design en option, pour le seul habillage de Survol (§ 9)**
The Locomotion Lab · septembre 2026

Source de l'audit : `apps/site/components/studio`, `apps/site/components/outils/*`, `apps/site/lib/carrousel*.js`, `lib/habillage.js`, `lib/gpxStats.js`, `packages/ui`, `packages/tracking`, et la vidéo de replay Coros fournie (1:33, 9:16).

---

## 0. L'essentiel en une page

**Le constat.** Le studio a un bon moteur et une mauvaise interface. Le moteur : un canvas 2D qui *est* l'image exportée, tout dans le navigateur, hors ligne, projets en IndexedDB, gabarits fidèles à la charte, découpage en journées, étiquettes qu'on attrape. L'interface : deux ateliers séparés qui se recoupent (Carrousel / Habillage photo), 121 propriétés par planche réglées par 138 champs de formulaire répartis dans 6 onglets et 36 sections, aucune édition du texte dans l'image, aucune poignée, aucun Ctrl+Z. On règle une image en cherchant le bon curseur au lieu de toucher l'image.

**La proposition.** Un seul poste de travail, un seul modèle de document, deux familles de planches : les planches **image** (les gabarits d'aujourd'hui, devenus des modèles composés d'éléments qu'on saisit, déplace, redimensionne, édite en place) et les planches **Survol** (la séance rejouée sur une carte 3D, à la manière de Coros et de Strava Flyover, aux couleurs du labo, exportée en vidéo). L'ergonomie essentielle de Canva — sélection, barre contextuelle, calques, guides, annuler/refaire, raccourcis, bibliothèque, export multi-format — mais avec la charte verrouillée et des éléments **reliés aux données de la trace** (carte, profil, chiffres, journées), que Canva n'a pas.

**Ce qui ne change pas.** Le rendu canvas = l'image finale ; tout côté client ; la grammaire visuelle du compte (bande d'en-tête, surtitre au filet ambre, titre en Ubuntu Sans 700, pied paginé « 05 / 10 », « GLISSE → ») ; une seule police, Ubuntu Sans (variable 300 → 800, romain et italique) ; la palette ; les journées ; les projets locaux ; le dernier mot à l'auteur sur les chiffres.

**Le chemin.** Quatre phases : (1) le socle — modèle de document v2, historique, sélection et manipulation directe ; (2) le poste de travail complet — modèles, texte, photo, éléments, calques, mobile, export ; (3) Survol — pipeline de séance, scène 3D, habillage, montage, export vidéo ; (4) finitions — MP4 mobile, moments photo, images clés de caméra, toponymes.

---

## 1. Audit du studio actuel

### 1.1 Ce qu'on garde — les fondations sont bonnes

| Fondation | Où | Pourquoi ça compte |
|---|---|---|
| L'aperçu **est** l'image finale (canvas en pixels d'export, réduit en CSS) | `lib/carrouselCartes.js` | Aucune surprise à l'export ; c'est la base de toute manipulation directe |
| Tout dans le navigateur, hors ligne (service worker sur `/studio`, manifeste séparé, icône propre) | `Studio.jsx`, `public/sw.js`, `app/studio/layout.jsx` | Usage au bivouac ; rien à protéger côté serveur |
| Projets en IndexedDB, autosauvegarde différée (1,2 s), fichier de secours JSON | `lib/carrouselProjet.js` | Rien ne se perd ; les photos gardent leur poids réel (Blob) |
| Huit gabarits fidèles à la charte (carte, bandeau, photo, texte, fiche, étape, journées, clôture) | `GABARITS` | Deux carrousels à six mois d'écart se ressemblent encore |
| La trace : GPX et `.track.json`, fusion de plusieurs fichiers, coupures en journées, étiquettes déplaçables, trace de cadrage figée | `lib/carrouselTrace.js`, `lib/carrouselGeo.js` | Le savoir-faire propre au labo, absent de Canva |
| Un clic dans la planche ouvre le réglage correspondant (`ZONES`) | `CarrouselAtelier.jsx` | Le premier pas vers la manipulation directe — à généraliser |
| Planches de journée en un clic (« Jour N », avancement ou journée seule) | `CarrouselAtelier.jsx` | Le geste le plus répété d'un carrousel d'aventure |
| Pièces détachées (trace, logo en PNG transparent) | export pièces | Un aveu utile : Canva sert encore pour monter ailleurs |
| Trois formats et la zone sûre de la story (250 → 1600) | `FORMATS` | La contrainte Instagram est déjà dans le moteur |
| Feuille mobile à trois paliers, rail sous le pouce | `CoqueAtelier.jsx` | Le bon réflexe ; c'est le contenu des panneaux qui le trahit |
| Les chiffres sont modifiables (« le dernier mot à l'auteur ») | `HabillagePhoto.jsx` | À conserver comme règle des éléments liés aux données |
| Le service worker, le partage système (`navigator.share`), HEIC accepté | `HabillagePhoto.jsx`, `lib/imageFile.js` | À généraliser à tout le studio |

### 1.2 Ce qui coince

1. **Deux ateliers pour un même geste.** Carrousel et Habillage photo partagent photo + trace + chiffres, mais avec deux moteurs de rendu (`carrouselCartes.js` / `habillage.js`), deux modèles de données, deux barres — et l'Habillage n'a ni projets ni autosauvegarde. « Silhouette » et « Chiffres » sont deux gabarits de story qui ont leur place dans le même outil.
2. **L'image est passive.** Seules les étiquettes de carte et les « zones libres » se déplacent au doigt. Le titre, la photo, la fiche, la colonne, le logo se règlent dans le panneau : pas de sélection, pas de poignées, pas de redimensionnement, pas de rotation, pas d'édition en place.
3. **Un élément, six endroits.** Le titre se saisit dans « Texte », sa police dans « Allure › Polices », son corps dans « Allure › Corps », sa couleur dans « Allure › Couleurs », son ombre dans « Allure › Ombre », son filet dans « Texte › Titre ». L'onglet Allure compte neuf sections. C'est l'inverse du modèle Canva : *sélection → barre contextuelle → tout ce qui concerne l'élément, et rien d'autre.*
4. **Le volume.** 121 propriétés par planche, 138 contrôles, 36 sections, 6 onglets. Le balisage du texte (`AIDE_BALISAGE`, puces) est puissant mais invisible : on tape un langage dans un `textarea` pour obtenir un gras, une italique ou une liste.
5. **Rien à annuler.** Aucun historique, aucun Ctrl+Z, aucun raccourci hors Ctrl+molette. Avec 121 propriétés, une fausse manipulation coûte cher — et « Propager » applique un style à toutes les planches sans retour possible.
6. **Les réglages du lot sont dispersés.** Format et thème dans la barre sur grand écran mais dans « Projet » sur téléphone ; l'export dans la barre *et* dans « Planche » ; les pièces détachées dans « Planche ».
7. **L'export est minimal.** JPEG 0,92 seulement, nommage horodaté, téléchargements en rafale (contournement Safari), pas de PNG, pas de ZIP, pas de partage système côté carrousel.
8. **Sur téléphone, c'est la planche qui paie.** Feuille à 38 % + barre d'outils + bande de vignettes + rail : la planche descend au plancher de 26 dvh. Les libellés d'onglets disparaissent sous `sm`.
9. **Pas de bibliothèque.** Une photo par planche, pas de réutilisation, un curseur « ancrage » en guise de recadrage, aucun réglage d'image, pas de formes, pas de multi-photos.
10. **Pas de temps.** Le modèle ne connaît que l'image fixe. Survol impose un modèle de planche qui accepte une durée, une timeline et un export vidéo — autant refonder le modèle une fois pour toutes.
11. **Des restes de l'ancienne charte.** Le sélecteur de police propose encore « Lora — serif d'accent » et « Ubuntu Mono — instrument » (`POLICES`, `lib/carrouselCartes.js`), mais depuis la refonte `policesDuSite()` résout les trois choix sur la même variable `--next-font-ubuntu` : trois options, un seul rendu. Le réglage « police » disparaît ; la hiérarchie passe par la graisse (300 → 800), la casse et l'interlettrage, comme sur le site. Et `CLAUDE.md` (invariant 1) dit toujours « Ubuntu + Lora » — à corriger **avant** de lancer Claude Code, qui le lit en premier et réintroduirait Lora de bonne foi.

### 1.3 Canva et le studio : ce qui manque vraiment

| Fonction essentielle de Canva | Studio v1 | Studio v2 |
|---|---|---|
| Sélectionner, déplacer, redimensionner, pivoter | Étiquettes et zones libres seulement | Tout élément |
| Double-clic : éditer le texte en place | Non (`textarea` + balisage) | Oui, caret dans l'image |
| Barre contextuelle sur la sélection | Non | Oui |
| Calques (ordre, verrou, masquage) | Non | Oui |
| Guides d'alignement, magnétisme, distribution | Non | Oui |
| Annuler / refaire, raccourcis clavier | Non | Oui |
| Copier / coller éléments, copier le style | « Propager » global | Oui, plus « Propager » par style |
| Recadrer une photo, l'ajuster, la retourner | Curseur d'ancrage | Mode recadrage à poignées, ajustements |
| Formes, lignes, icônes | 90 icônes (puces), filets fixes | Formes de base, filet ambre libre, icônes |
| Bibliothèque de médias du projet | Non | Oui |
| Modèles | 8 gabarits verrouillés | 11 modèles = point de départ, composition libre ensuite |
| Kit de marque | Implicite (codé) | Explicite et verrouillé : une police (Ubuntu Sans) et ses graisses, une palette |
| Pages : ajouter, dupliquer, réordonner | Ajouter, réordonner | + dupliquer, sélection multiple |
| Export multi-format, sélection de pages, ZIP, partage | JPG en rafale | PNG / JPG, 1× / 2×, ZIP, feuille de partage |
| Vidéo : timeline, export MP4 | Non | Survol |
| Éléments reliés aux données (carte, profil, chiffres, journées) | Oui, mais figés dans les gabarits | Oui, comme éléments libres — **l'avantage sur Canva** |

Ce qu'on **ne reprend pas** de Canva, à dessein : polices libres, couleurs hors charte en premier rang, banque d'images, autocollants animés, collaboration temps réel. Le studio est l'outil d'un auteur unique, pour une seule marque.

---

## 2. Principes de design de la v2

1. **La planche est l'interface.** Tout ce qui se voit se saisit. Le panneau complète ce que la main ne règle pas au pixel ; il ne remplace jamais le geste.
2. **Un élément, un endroit.** Sélectionner un élément affiche tout ce qui le concerne, et rien d'autre : la barre contextuelle pour les six réglages fréquents, l'inspecteur pour le reste.
3. **Divulgation progressive.** Par défaut, les valeurs de la charte. « Plus » ouvre les curseurs fins. Aucun réglage essentiel derrière un accordéon plié.
4. **Rien ne se perd.** Historique illimité dans la session, autosauvegarde continue, versions nommées, fichier de secours.
5. **La charte est un garde-fou, pas une prison.** Une seule police — Ubuntu Sans, dont la graisse, la casse et l'interlettrage font toute la hiérarchie —, une palette (l'hexadécimal libre en second rang), les mêmes filets, la même bande d'en-tête. À l'intérieur, la composition est libre.
6. **Les données font le travail.** Carte, profil, chiffres, journées sont des éléments reliés à la séance : on les pose, ils se remplissent. L'auteur garde le dernier mot (valeur manuelle possible, signalée).
7. **Le même outil pour l'image et la vidéo.** Une planche Survol se manipule comme une planche image : mêmes éléments d'habillage, même barre, même inspecteur — plus une timeline.
8. **Le téléphone n'est pas une version dégradée.** Même modèle mental (sélection → barre contextuelle → feuille d'un seul réglage). Ce qui change, c'est la place, pas la logique.
9. **Sobre, chaud, typographique.** Le chrome du studio s'efface : crème, filets fins, Ubuntu à 13 px. La seule chose qui a de la couleur, c'est la planche.

---

## 3. Architecture

### 3.1 Le modèle de document

```
Projet
├─ id, nom, créé le, modifié le, schéma = 2
├─ format : carrousel 1080×1350 · story 1080×1920 · carré 1080×1080   (réglage du lot)
├─ thème  : sombre · clair                                             (réglage du lot)
├─ bilan  : avant · après   (ce que le carrousel raconte : l'annonce ou le récit)
├─ données
│  ├─ trace   : coords, cumul km, profil, coupures (journées), étiquettes, trace de cadrage, source
│  └─ séance  : points horodatés { lat, lon, alt, t, dist, fc, cadence } — pour Survol et les variables
├─ médias[]   : photos en Blob { id, nom, largeur, hauteur, prise le, GPS EXIF si présent }
└─ planches[]
   ├─ Planche image  { id, type:"image", modèle d'origine, fond, éléments[] }
   └─ Planche survol { id, type:"survol", scène, caméra, montage, hud: éléments[], durée }

Élément (commun) { id, type, nom, x, y, l, h (fractions du format), rotation, opacité, verrouillé, masqué }
  texte   contenu riche (gras · italique · accent · liste), rôle (surtitre · titre · corps · libre),
          corps, graisse (300 → 800), italique, casse (capitales espacées), couleur, alignement, interligne, lettrage,
          ombre {flou, dx, dy, opacité, couleur}, plaque {couleur, opacité, marges, rayon, dégradé},
          filet de surtitre, filet sous titre, variables autorisées
  photo   mediaId, cadrage {x, y, échelle}, retournée, réglages {luminosité, contraste, saturation},
          voile {couleur, opacité}, dégradés {haut, bas, hauteur}, coins, bordure, « fond de planche »
  forme   rectangle · cercle · ligne · filet ambre — remplissage, contour, coins
  icône   clé lucide, couleur, épaisseur, taille
  marque  logo · nom · les deux · cercle de clôture — teinte (ambre par défaut)
  carte   fond (relief · topo · sat · aucun), tranche de journées, couleurs, épaisseur,
          étiquettes[] (déplaçables), départ / arrivée, silhouette (trace seule)
  profil  tranche, hauteur, remplissage, restant estompé
  stat    variable ({distance}, {dplus}, {durée}…), format, libellé, taille, valeur manuelle ?
  fiche   lignes[{ libellé, valeur | variable }]
  cases   journées en grille : n, colonnes, mini-carte, mini-profil, filet
```

**Migration.** Les projets v1 (schéma 1) sont convertis à l'ouverture : chaque planche est instanciée depuis son gabarit avec ses valeurs, puis ses pièces deviennent des éléments v2 aux mêmes positions. Le fichier v1 est conservé en secours. Aucune perte.

### 3.2 Le poste de travail — grand écran (≥ 1024 px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ◉  Écrins 2026 — récit ✎     Carrousel 1080×1350 ▾  [Sombre|Clair]   ↶ ↷   42 % ▾     │
│                                              Enregistré à l'instant · [Partager] [Exporter ▾] │ 48 px
├────┬──────────────────┬──────────────────────────────────────────────┬────────────────┤
│ ▦  │  TEXTE           │                                              │  Titre         │
│Mod.│  ────────────    │        ┌─────────────────────┐               │  ─────────     │
│ T  │  + Titre         │        │ ◉ THE LOCOMOTION LAB│               │  Typographie   │
│Tex.│  + Surtitre      │        │                     │               │  Ubuntu ▾      │
│ ▣  │  + Paragraphe    │        │ ▬ LA SORTIE         │               │  65 ▾  Bold ▾  │
│Méd.│  + Liste         │        │ ┌·················┐ │  ← barre      │  Couleur       │
│ ⌇  │  + Chiffre       │        │ ·Croix de        · │    contextuelle│  ● ● ● ● ● #   │
│Don.│  + Fiche         │        │ ·Belledonne      · │    flottante   │  Effets        │
│ ◇  │                  │        │ └─────────────────┘ │               │  ☐ Ombre       │
│Élé.│  STYLES          │        │  24,3 km · 1 460 m  │               │  ☐ Plaque      │
│ ≡  │  Surtitre        │        │      [carte]        │               │  Position      │
│Cal.│  Titre           │        │                     │               │  x y l h ↻  🔒 │
│ ▤  │  Corps           │        │ 03 / 12   GLISSE →  │               │  Calque        │
│Pro.│                  │        └─────────────────────┘               │  ↑ ↓ ⧉ 🗑      │
│    │                  │        · · · zone sûre / guides · · ·        │                │
├────┴──────────────────┼──────────────────────────────────────────────┴────────────────┤
│ 64 │ 320 (repliable)  │ [1 Carte][2 Étape][3 Étape][4 Photo]…[+]         ▹ ⧉ 🗑         │ 108 px
└────┴──────────────────┴────────────────────────────────────────────────────────────────┘
                                                                            296 px
```

- **Barre haute (48 px).** La marque pour sortir (conservée) ; le nom du projet éditable ; format et thème du lot (une seule place, toujours la même) ; annuler / refaire ; zoom (Ajuster, 50, 100, 200 %) ; l'état de sauvegarde en clair ; Partager ; **Exporter** en bouton principal terracotta.
- **Rail (64 px) + tiroir (320 px).** Sept entrées, dans l'ordre où l'on compose : Modèles, Texte, Médias, Données, Éléments, Calques, Projets. Le tiroir se replie (le poste de travail devient canvas + inspecteur). Glisser un item du tiroir vers la planche le pose là où on lâche ; un clic le pose au centre.
- **Le plan de travail.** Fond neutre (`brand-text/5`), la planche avec `--shadow-card`, zone sûre de la story en pointillé, guides magnétiques bleu-vert. Espace + glisser pour le panoramique, Ctrl + molette pour zoomer, pincer sur trackpad.
- **La barre contextuelle.** Flottante, au-dessus de la sélection (ou sous elle si le haut manque), hauteur 40 px : six réglages fréquents de l'élément + « ⋯ » qui ouvre l'inspecteur à la bonne section. Elle n'apparaît que sur sélection et ne bouge jamais la planche.
- **L'inspecteur (296 px).** Tout ce qui concerne la sélection, en sections ouvertes. Sans sélection : les réglages de la planche (fond, marque, bande d'en-tête, pied, filets, numéro, flèche, tranche de journée).
- **La bande des planches (108 px).** Vignettes réelles 76 px, numéro et nom du modèle, glisser pour réordonner, menu contextuel (dupliquer, insérer avant / après, planche de journée, supprimer), sélection multiple avec Shift.

### 3.3 Le poste de travail — téléphone (< 1024 px)

```
┌────────────────────────┐        ┌────────────────────────┐
│ ◉  Écrins 2026   ↶  ⬇  │ 44 px  │ ◉  Écrins 2026   ↶  ⬇  │
├────────────────────────┤        ├────────────────────────┤
│                        │        │                        │
│     ┌────────────┐     │        │     ┌────────────┐     │
│     │            │     │        │     │ ┌········┐ │     │
│     │  planche   │     │        │     │ ·Titre   · │     │
│     │            │     │        │     │ └────────┘ │     │
│     │            │     │        │     │            │     │
│     └────────────┘     │        │     └────────────┘     │
│                        │        ├────────────────────────┤
│                        │        │ Police  Corps  Couleur…│ 44 px chips
├────────────────────────┤        ├────────────────────────┤
│ [+ Ajouter] [Planches] │ 56 px  │ ━━━                    │
│              [Données] │        │  Corps      65        │ feuille ≤ 40 %
└────────────────────────┘        │  ───────●─────────    │
   sans sélection                 └────────────────────────┘
                                     avec sélection, un chip ouvert
```

- **Sans sélection.** La planche prend tout ; une barre du bas avec trois actions : **+ Ajouter** (feuille : Texte, Photo, Éléments, Données, Modèles), **Planches (n)** (bande horizontale à la demande, repliée par défaut), **Données**.
- **Avec sélection.** Une rangée de chips défilante (Modifier, Corps, Graisse, Couleur, Effets, Position, Calque, Plus…). Un chip ouvre **une feuille d'un seul réglage** (le modèle de Canva mobile), plafonnée à 40 % de la hauteur : la planche reste visible et le réglage se voit en direct. Pincer pour zoomer, deux doigts pour déplacer la vue.
- **Le texte.** Appui long ou double tap = édition en place, clavier ouvert, planche remontée pour que le champ reste visible.
- **Survol.** Lecteur plein écran, chips : Caméra, Habillage, Durée, Exporter ; la timeline sous la scène.

### 3.4 Les sept tiroirs

| Tiroir | Contenu |
|---|---|
| **Modèles** | Grille de vignettes rendues dans le format et le thème courants : Carte, Bandeau, Photo, Texte, Fiche, Étape, Journées, Clôture, **Story Silhouette**, **Story Chiffres** (les deux habillages photo, rapatriés), **Survol**. Bouton « Planche de journée » (Jour N, étape ou carte, avancement ou journée seule). |
| **Texte** | Ajouter un titre, un surtitre, un paragraphe, une liste, un chiffre (stat), une fiche. Les trois styles de la charte (Surtitre, Titre, Corps) : appliquer, mettre à jour depuis la sélection, propager. |
| **Médias** | La bibliothèque du projet : photos importées (HEIC accepté), date et lieu EXIF, glisser sur la planche, « Remplacer la photo sélectionnée ». Estimation du stockage local. |
| **Données** | Charger une trace ou une séance (GPX, `.track.json`, FIT), fusion bout à bout, l'itinéraire de l'aventure (`liveConfig`), les journées (coupures, régulières ou aux repères), la trace de cadrage, avant / après. Le résumé de la séance (distance, D+, D−, durée, allure, FC) et la liste des **variables** disponibles. |
| **Éléments** | Formes (rectangle, cercle, ligne, filet ambre), icônes (90 pictogrammes lucide, filtre sans accent), marque (logo, nom, cercle de clôture), carte, profil, cases de journées. |
| **Calques** | La liste ordonnée des éléments de la planche : glisser, verrouiller, masquer, renommer, dupliquer. Le seul chemin clavier vers un élément recouvert. |
| **Projets** | Nouveau, ouvrir, dupliquer, renommer, supprimer, versions nommées, exporter / importer un fichier `.llstudio` (JSON + médias). |

---

## 4. Les interactions, en détail

### 4.1 Sélection et manipulation directe

- **Sélectionner** : un clic. Cadre bleu-vert (`--color-brand-primary-dark`) à 1,5 px, huit poignées de 10 px, une poignée de rotation au-dessus. Shift + clic ajoute ; un glissé sur le fond trace un rectangle de sélection ; Échap désélectionne.
- **Déplacer** : glisser. Flèches = 1 px de format, Shift + flèches = 10 px. Les distances aux voisins s'affichent pendant le glissé.
- **Redimensionner** : coins = proportionnel ; côtés = libre pour un texte ou une forme, **recadrage** pour une photo (le cadre change, la photo ne se déforme jamais). Alt = depuis le centre.
- **Magnétisme** : bords et centre de la planche, marges de la charte (64 px), zone sûre, bords et centres des autres éléments, alignement des lignes de base des textes. Lignes de guide 1 px bleu-vert, étiquette de distance en chiffres tabulaires.
- **Distribuer / aligner** : sur sélection multiple, la barre contextuelle propose aligner (6) et répartir (2).
- **Verrouillé** : sélectionnable, non déplaçable, cadenas dans le cadre. Les pièces de la charte posées par un modèle (bande d'en-tête, pied) sont libres mais offrent « Remettre à la charte ».
- **Menu contextuel** (clic droit, appui long) : Dupliquer, Copier, Coller, Copier le style, Coller le style, Verrouiller, Devant / Derrière, Grouper, Supprimer.

### 4.2 Texte

- **Édition en place** : double-clic (ou appui long) pose le caret dans l'image. Techniquement, un `contenteditable` superposé au pixel près pendant l'édition, rendu au canvas à la sortie — ce qu'on voit reste ce qu'on exporte. Une sélection de mots reçoit gras, italique, couleur d'accent, lien de liste.
- **Barre contextuelle** : `[65 −/+] [Graisse ▾ 300 → 800] [Aa casse ▾] [● couleur] [≡ alignement] [Espacement ▾] [Effets ▾] [Liste ▾] [⋯]`.
- **Inspecteur** : Contenu (avec insertion de variable), Typographie (corps, graisse 300 → 800, italique, casse, interligne, lettrage), Couleur, Effets (ombre : flou, décalage, opacité, couleur ; plaque : couleur, opacité, marges, rayon, dégradé de bord), Filets (surtitre, sous-titre : largeur, épaisseur, couleur), Position, Calque.
- **Styles de la charte** : Surtitre (capitales espacées, filet ambre), Titre (700, 65 px, deux lignes), Corps (régulier 38, aéré). Un clic applique ; « Mettre à jour le style » enregistre la sélection comme nouveau style ; « Propager » l'applique à toutes les planches — avec annulation.
- **Le duo en ligne** (« Jour 1 · VÉNOSC → VALGAUDÉMAR ») devient une option du style Titre, plus un réglage caché.
- Le balisage v1 (`AIDE_BALISAGE`) reste lu à l'import ; il n'est plus la saisie principale.

### 4.3 Photo

- **Insérer** : depuis Médias, ou en lâchant un fichier sur la planche. La photo prend la place du cadre d'accueil si on la lâche sur un cadre vide.
- **Recadrer** : double-clic. La photo entière apparaît estompée, le cadre reste net ; on déplace et on zoome la photo dans le cadre (molette, pincement) ; poignées du cadre ; Entrée valide.
- **Barre contextuelle** : `[Recadrer] [↔ Retourner] [Ajuster ▾ luminosité · contraste · saturation] [Voile ▾] [Dégradés ▾ haut · bas] [Coins] [Remplacer] [⋯]`.
- **Fond de planche** : une photo peut être « fond » — verrouillée derrière tout, plein cadre, avec ses dégradés (les gabarits Photo, Étape, Clôture).

### 4.4 Éléments

- **Formes** : rectangle, cercle, ligne, et le **filet ambre** de la charte (épaisseur 10, ambre du thème) comme forme à part entière — posable n'importe où.
- **Icônes** : les 90 lucide, filtre texte sans accent, couleur de la charte, taille, épaisseur.
- **Marque** : logo cerclé, logo + nom, nom seul ; teinte ambre par défaut, encre du thème en option.

### 4.5 Données — les éléments intelligents

- **Carte** : fond (relief, topo, satellite, aucun = silhouette), tranche de journées (toutes · jusqu'au jour N · jour N seul), couleurs de journées (palette : fuchsia du live, ambre, terracotta, bleus), épaisseur, étiquettes (texte, icône, glisser dans l'image), départ / arrivée, l'itinéraire complet en sourdine sous la tranche.
- **Profil** : hauteur, remplissage, tranche, restant estompé, la silhouette seule.
- **Chiffre** : une variable et un format. `{distance}` 24,3 km · `{dplus}` 1 460 m · `{dmoins}` · `{durée}` 7 h 45 · `{allure}` 5'20"/km · `{vitesse}` · `{fc_moy}` · `{fc_max}` · `{jour}` · `{jour_distance}` · `{jour_dplus}` · `{nom}` · `{date}`. Une **valeur manuelle** remplace le calcul (pastille « manuel » dans l'inspecteur) — la montre a toujours raison sur son propre fichier.
- **Fiche** : n lignes libellé / valeur, chaque valeur libre ou variable.
- **Cases** : les journées en grille (n, colonnes, mini-carte, mini-profil, filet).
- **Planche de journée** : la tranche est un réglage de la planche ; carte, profil et chiffres la suivent.

### 4.6 Modèles

- Les huit gabarits et les deux stories de l'Habillage deviennent onze **modèles** (avec Survol). Choisir un modèle instancie des éléments aux positions et styles de la charte ; ensuite tout se déplace, et « Remettre le modèle » réaligne.
- Changer de modèle sur une planche existante : mappage des rôles (titre → titre, photo → photo, chiffres → chiffres), comme `changerGabarit` aujourd'hui, sans perte.
- Les vignettes de la galerie sont des rendus réels dans le format et le thème du projet — pas des images fixes.

### 4.7 Planches

Bande de vignettes réelles ; glisser pour réordonner (souris au premier mouvement, doigt après appui long — conservé) ; menu : dupliquer, insérer avant / après, planche de journée, supprimer ; PgUp / PgDn pour passer de l'une à l'autre ; sélection multiple pour l'export.

### 4.8 Historique et raccourcis

- Historique par projet (pile de patches), un glissé = une étape, « Propager » = une étape. Ctrl+Z / Ctrl+Shift+Z, boutons ↶ ↷ dans la barre.
- Raccourcis : `V` sélection · `T` texte · `R` rectangle · `L` ligne · `Ctrl+D` dupliquer · `Suppr` · `Ctrl+C/V` · `Ctrl+Shift+C/V` copier / coller le style · `Ctrl+G` grouper · `Ctrl+]` `[` ordre · `Ctrl+0` ajuster · `Ctrl+ +/−` zoom · `Espace` + glisser panoramique · `PgUp/PgDn` planche · `Ctrl+E` exporter · `?` la fiche des raccourcis.

### 4.9 Export et partage

- **Dialogue Exporter**, une seule place : quoi (toutes · sélection · planche courante), format (JPG 92 % · PNG), échelle (1× · 2× pour l'impression), nom (`nom-du-projet-03.jpg`), livraison (fichiers séparés · ZIP · **Partager** via la feuille système sur téléphone, comme l'Habillage aujourd'hui). Aperçu en mosaïque des planches retenues.
- **Pièces** : onglet du même dialogue — trace, profil, logo, carte sans texte, en PNG transparent, à la taille voulue.
- **Vidéo** : onglet Survol (§ 5.7).

### 4.10 Projets et sauvegarde

Autosauvegarde continue avec l'état en clair dans la barre (« Enregistré à l'instant », « Enregistrement… », « Hors ligne — sauvegardé localement ») ; versions nommées (« avant relecture ») et restauration ; fichier `.llstudio` (JSON + médias en ZIP) pour changer de navigateur ; estimation et nettoyage du stockage local.

---

## 5. Survol — la séance rejouée sur la carte 3D

### 5.1 Le modèle, et ce qu'on fait mieux

**Observé sur la vidéo Coros** (1:33, 9:16) : terrain satellite incliné, caméra qui suit un point rouge dans le sens de la marche, trace jaune tracée derrière le point (l'itinéraire à venir en trait fin), quatre chiffres en tête qui défilent (distance, allure, altitude, FC) avec leurs icônes, toponymes, lecture / pause, minutage, logo Coros. **Strava Flyover** fait la même chose (moteur Fatmap) : trace orange, point bleu, stats en direct, partage direct en story ; ses limites relevées par les testeurs : vidéos trop longues, vitesse constante, aucun montage.

**Ce que Survol fait mieux** : la durée se choisit (15 · 30 · 60 · 90 s) ; la vitesse du point suit la distance ou le temps réel (on le voit ralentir dans la montée) ; une intro et une clôture ; l'habillage aux couleurs du labo ; le profil de progression ; les chiffres au choix ; les moments photo ; l'export dans le format de la publication ; une caméra qu'on règle.

### 5.2 Données d'entrée

- **Fichiers** : GPX de montre (Coros, Garmin : `trkpt`, `ele`, `time`, extensions `gpxtpx:hr`, `gpxtpx:cad`, `gpxdata:distance`), `.track.json` de la balise, FIT (phase 4).
- **Extraction** (`packages/trace`, TypeScript, testé) : points {lat, lon, alt, t, dist}, FC, cadence ; rééchantillonnage à 1 s ; lissages (allure : fenêtre glissante 30 s ; altitude : médiane sur 5 points) ; D+ cumulé avec le même seuil que `gpxStats` ; détection des pauses (> 20 s sans déplacement), avec l'option « retirer les pauses » ; cap lissé, vitesse, pente, temps écoulé, heure locale.
- **Sans horodatage** (itinéraire prévu) : Survol « d'itinéraire », vitesse constante, chiffres limités (distance, altitude, D+).

### 5.3 La scène 3D

- **Moteur** : MapLibre GL JS (déjà dans le dépôt, v5) avec le terrain (`raster-dem`), exagération 1,3 (réglable 1 → 2). Les lignes sont drapées sur le relief nativement.
- **Sources** : relief = tuiles Terrarium (AWS Terrain Tiles, gratuites, attribution) ou MapTiler Terrain-RGB (clé, meilleure finesse en haute montagne) ; imagerie = Esri World Imagery (déjà utilisée sur le site — vérifier les conditions pour une vidéo publiée, attribution obligatoire) ; en option les fonds « Relief » (Esri World Topo) et « Topo » (OpenTopoMap) sur relief 3D ; toponymes : couche vecteur (OpenFreeMap ou MapTiler), phase 4.
- **Ciel** : dégradé crème → bleu-vert de la charte au-dessus de l'horizon, brume légère au loin (`sky` de MapLibre), plutôt que le bleu générique.
- **Trace** : parcourue = **ambre `#EFB159`**, épaisseur 6 sur liseré crème à 90 % ; restante = crème à 40 %, épaisseur 2 ; le point = cœur terracotta `#B67352` + halo ambre pulsant (le marqueur du direct, `LiveMap.jsx`). Variante « Carto » : le fuchsia `#D6246E`, convention des cartes du site. Une ombre douce sous la trace pour la lisibilité sur l'imagerie.

### 5.4 La caméra

| Mode | Comportement |
|---|---|
| **Suivre** (défaut) | Derrière le point, pitch 60°, cap = direction de marche lissée (constante de temps 4 s), zoom automatique selon la vitesse et le relief (plus serré en montée lente, plus large en descente rapide), rotation plafonnée à 25°/s — jamais de secousse. |
| **Orbite** | Tour lent autour du point (un col, un sommet) ; vitesse et rayon réglables. |
| **Vue d'ensemble** | L'itinéraire entier, pitch 45°, dérive lente. |
| **Trajet** | Intro (0 → 3 s : vue d'ensemble puis plongée sur le départ), corps (Suivre), clôture (3 dernières secondes : recul vers la vue d'ensemble, carte de bilan). |
| **Images clés** (phase 4) | À un km donné : mode, pitch, cap, zoom ; interpolation douce entre les clés ; marqueurs sur la timeline. |

Tous les paramètres vivent dans l'inspecteur « Caméra », avec aperçu immédiat sur la scène.

### 5.5 L'habillage — le HUD aux couleurs du labo

Le HUD est une planche d'éléments (les mêmes qu'au § 4) posée sur la scène : on le compose, on le déplace, on le propage. Modèle par défaut **Survol story** (1080 × 1920) :

```
      ┌──────────────────────────────┐
 250  │        (zone Instagram)      │
      ├──────────────────────────────┤
      │ ◉ THE LOCOMOTION LAB         │  bande d'en-tête, logo ambre, capitales espacées
      │──────────────────────────────│  filet
      │  ⌇ 7,37   ◔ 7'33"  ▲ 980  ♥137│  4 chiffres : icône 28 · valeur en 700, 72 px, largeur fixe
      │   km       /km       m    bpm│  unité en 500, 24 px, capitales espacées, crème douce
      │                              │
      │                              │
      │         [ scène 3D ]         │  le point, la trace ambre, le relief
      │                              │
      │                              │
      │ ▬ LA SORTIE                  │  surtitre au filet ambre
      │ Croix de Belledonne          │  titre en 700, 56 px
      │ 14 juin 2026 · 24,3 km · 1 460 m │  ligne factuelle en 500, chiffres à largeur fixe
      │ ▁▂▃▅▇▆▅▃▂▁▁▂▃▅▇█▇▅▃▂▁▁▂     │  profil 150 px, rempli ambre jusqu'au curseur
      │ Relief © Esri · AWS Terrain  │  attribution 20 px
 1600 ├──────────────────────────────┤
      │        (zone Instagram)      │
      └──────────────────────────────┘
```

- Les **chiffres** : 4 au choix parmi distance, allure, vitesse, altitude, D+, FC, cadence, temps écoulé, heure. Chiffres posés en cases de largeur fixe — le canvas ne connaît pas `tabular-nums` — pour que rien ne saute d'une image à l'autre ; transitions sans clignotement. Sur le carré, la rangée passe en 2 × 2.
- Les **voiles** : un voile sombre (`#1A1C18` à 55 %, dégradé vers le transparent) sous la bande haute et sous le bloc bas, pour lire sur l'imagerie ; version claire sur fond relief. Pas de pagination ni de « GLISSE → » sur une vidéo.
- La **carte de bilan** (clôture) : la trace entière, distance, D+, durée, FC moyenne, la marque cerclée — la grammaire de la planche Clôture.
- Formats : story 9:16 par défaut, carrousel 4:5 et carré 1:1 pour le fil.

### 5.6 Le montage

- **Durée cible** : 15 · 30 · 60 · 90 s · libre ; 30 images/s (60 en option). Rappel affiché : une story accepte 60 s par segment, un reel davantage.
- **Vitesse** : « à la distance » (le point avance régulièrement) ou « au temps » (fidèle : il ralentit dans les montées) ; un curseur mélange les deux.
- **Rognage** : poignées de début et de fin sur la timeline ; pauses retirées.
- **Tenues** : 2 s sur le départ, 3 s sur l'arrivée, réglables.
- **Timeline** sous la scène : le profil altimétrique en fond, le curseur, les marqueurs de journées et de moments ; lecture / pause (Espace), image par image (◀ ▶), vitesse d'aperçu ×1 ×2 ×4 ; l'aperçu tourne à la résolution de l'écran, l'export à 1080.
- **Moments** (phase 4) : déposer une photo de la bibliothèque à un km (automatique si l'EXIF porte le GPS) : elle surgit 2,5 s en carte flottante à la charte, la caméra passe en orbite, puis reprend.

### 5.7 Export vidéo

- **Cible** : MP4 H.264, 1080 × 1920 (ou le format choisi), 30 i/s, ~12 Mbit/s, piste audio silencieuse AAC (certaines apps refusent un MP4 muet). Nom : `nom-du-projet-survol.mp4`.
- **Méthode** : rendu **image par image à pas de temps fixe**, pas en temps réel. Pour chaque image : caméra et sources positionnées, attente des tuiles, composition scène + HUD dans un canvas 1080 × 1920, encodage (WebCodecs `VideoEncoder` → `mp4-muxer`). Le résultat est identique sur tout appareil, sans image sautée.
- **Repli** : `MediaRecorder` (WebM VP9, temps réel) quand WebCodecs manque, avec message clair ; conversion possible plus tard.
- **Préchargement** : avant l'export, une passe de mise en cache des tuiles le long de l'itinéraire (barre de progression), pour que le rendu ne bloque pas sur le réseau.
- **Progression** : dialogue modal avec l'image en cours, temps restant estimé, annulation. Ordre de grandeur affiché : 30 s à 30 i/s = 900 images ≈ 1 à 3 min sur un portable, 3 à 6 min sur téléphone. Le contexte WebGL interdit l'arrière-plan : on le dit.
- **Couverture** : la première et la dernière image en JPG (miniature du reel).
- **Hors ligne** : Survol indisponible sans réseau (tuiles) — bandeau explicite, le reste du studio fonctionne.

### 5.8 États

Vide (aucune séance) : illustration de la trace du labo et « Charge une séance — GPX ou FIT — pour la survoler » · tuiles en chargement : squelette de relief + spinner discret · sans réseau : bandeau · séance sans temps : mode itinéraire annoncé · fichier illisible · export en cours / réussi / échoué · appareil peu puissant : proposer 720p.

---

## 6. Le design system du studio (le chrome)

**Couleurs** — uniquement les tokens de `packages/ui` :

| Rôle | Token |
|---|---|
| Fond de l'application | `--color-brand-bg` (crème) |
| Panneaux, tiroir, inspecteur, feuilles | `--color-brand-paper` |
| Filets, bordures de champ | `--color-brand-field` · `--color-brand-hairline` |
| Texte du chrome | `--color-brand-text` ; secondaire `--color-brand-soft` ; libellés `--color-brand-muted` |
| Sélection, poignées, guides, focus, onglet actif | `--color-brand-primary-dark` (bleu-vert) — jamais l'ambre, réservé aux planches |
| Éléments liés aux données (pastilles « variable », « manuel ») | `--color-brand-accent-ink` |
| Bouton principal (Exporter, Ajouter), progression | `--color-brand-deep` (terracotta), survol `--color-brand-deep-dark` |
| Confirmation | `--color-brand-success` |
| Plan de travail | `brand-text/5` ; la planche porte `--shadow-card` |

Pas de mode sombre pour le chrome : les planches sombres se détachent mieux sur le crème, et le studio reste reconnaissable comme un lieu du labo.

**Typographie du chrome** — Ubuntu Sans 13 px (libellés 12, valeurs 13, titres de section 11 en 500, sans capitales espacées) ; `tabular-nums` sur toute valeur numérique de champ. Une seule famille, comme sur le site depuis la refonte : la hiérarchie vient de la graisse, de la casse et de l'interlettrage, jamais d'une seconde fonte.

**Composants à dessiner** : Barre haute · Rail (icône 20 px + libellé 10 px) · Tiroir · Inspecteur (section, Curseur avec valeur éditable, Nombre, Couleur — pastilles de charte puis hex —, Choix segmenté, Case, Sélecteur de graisse, Sélecteur de variable, Sélecteur de tranche) · Barre contextuelle flottante (40 px, boutons 32 px, séparateurs) · Poignées et cadre de sélection · Guides avec étiquette de distance · Vignette de planche (avec état actif, glissée, sélection multiple) · Timeline Survol (profil en fond, curseur, poignées de rognage, marqueurs) · Dialogue Exporter (images · pièces · vidéo) · Progression d'export · Feuille mobile (paliers 40 % · 80 %, poignée) · Chips mobiles (36 px) · Toasts (« Enregistré », « Export terminé ») · Bandeau d'état (hors ligne) · États vides.

**Iconographie** : lucide, 20 px, trait 1,75 (déjà en place).
**Motion** : ≤ 200 ms, `prefers-reduced-motion` respecté ; la barre contextuelle apparaît sans déplacer la planche ; le seul mouvement libre est le halo du point de Survol.
**Accessibilité** : focus visible bleu-vert 2 px ; cibles ≥ 40 px sur téléphone ; chaque élément du canvas atteignable par Calques et par Tab ; contraste AA du chrome ; `aria-label` sur tout bouton icône ; annonces `role="status"` pour l'autosauvegarde et l'export ; raccourcis documentés.

---

## 7. Les changements, v1 → v2

| Aujourd'hui | Demain |
|---|---|
| Deux ateliers (Carrousel, Habillage photo) montés côte à côte | Un poste de travail ; Silhouette et Chiffres deviennent deux modèles de story |
| Six onglets par « genre de chose » (Planche, Texte, Photo, Trace, Allure, Projet) | Un rail de sept tiroirs pour **ajouter**, un inspecteur pour **régler ce qui est sélectionné** |
| 121 propriétés réglées dans 138 champs | Les mêmes possibilités, portées par l'élément : six réglages fréquents dans la barre contextuelle, le reste dans l'inspecteur, les valeurs de la charte par défaut |
| Gabarits à mise en page figée | Modèles qui instancient des éléments libres ; « Remettre le modèle » pour retrouver la charte |
| Zones cliquables qui ouvrent un panneau | Sélection, poignées, rotation, guides, calques, groupes |
| Texte saisi en balisage dans un `textarea` | Édition en place, mise en forme sur la sélection, styles de la charte |
| Une photo par planche, ancrage par curseur | Bibliothèque de médias, recadrage à poignées, ajustements, voiles, plusieurs photos par planche |
| Pas d'historique | Annuler / refaire, un glissé = une étape, « Propager » annulable |
| Format et thème tantôt dans la barre, tantôt dans « Projet » | Toujours dans la barre haute, sur tous les écrans |
| Export JPG en rafale | Dialogue unique : PNG / JPG, 1× / 2×, sélection, ZIP, partage système, pièces, vidéo |
| Feuille mobile portant des formulaires longs | Chips contextuels, une feuille par réglage, planche toujours visible |
| Modèle de données image seulement | Modèle v2 avec planches image et Survol ; migration automatique des projets v1 |
| Pas de vidéo | Survol : scène 3D, caméra, HUD à la charte, montage, MP4 |
| Trace = coordonnées et profil | Séance = points horodatés avec FC et cadence ; variables dans les textes |
| `apps/site` en JavaScript, un composant de 4 365 lignes | `apps/studio` en TypeScript, moteur de rendu et parseurs extraits en packages testés |

---

## 8. Plan de réalisation (pour Claude Code)

### 8.1 Architecture proposée

- **Nouvelle app `apps/studio`** (Next + TypeScript, à partir de `apps/_template`). Elle respecte l'invariant « nouveau code en TypeScript », isole maplibre + terrain + encodeur vidéo du bundle du site, garde son manifeste et son service worker, et se déploie seule. Le site redirige `/studio` vers elle (`lib/legacyRedirects.mjs`).
- **`packages/trace`** (nouveau) : parseurs GPX / `.track.json` / FIT, statistiques, rééchantillonnage, lissages, journées — extraits de `lib/gpxStats.js` et `lib/carrouselTrace.js`, avec leurs tests. Réutilisable par le site (récits, cartes GPX).
- **`packages/planche`** (nouveau) : le modèle de document v2, la migration v1 → v2, et le **moteur de rendu canvas 2D** repris de `carrouselCartes.js`, `carrouselTexte.js` et `habillage.js`, réécrit en « rendu d'une liste d'éléments » (chaque type d'élément = une fonction de dessin + une boîte de test). Les primitives typographiques (lignes riches, plaque, ombre, capitales espacées) sont conservées telles quelles : ce sont elles qui font la charte.
- **`packages/ui`** et **`packages/tracking`** (existants) : tokens, polices, styles de carte (`mapStyles.ts`), couleurs de trace.
- **Le studio** : état par store (Zustand ou équivalent) avec patches immuables pour l'historique ; couche d'interaction propre (test de collision sur les boîtes des éléments, poignées, transformations, magnétisme) posée **sur** le moteur de rendu existant plutôt qu'un canvas tiers (Konva, Fabric) — c'est plus de travail, mais le rendu reste identique à l'export, et la typographie de la charte n'a pas à être réécrite dans un autre modèle de texte.
- **Survol** : `maplibre-gl` + `raster-dem` + `sky` ; composition scène + HUD dans un canvas d'export ; `VideoEncoder` (WebCodecs) + `mp4-muxer` ; repli `MediaRecorder`.
- **Persistance** : IndexedDB (schéma 2), un magasin projets + un magasin médias ; export `.llstudio` (ZIP).

### 8.2 Les phases

| Phase | Contenu | Critère de sortie |
|---|---|---|
| **1 · Le socle** | `packages/trace`, `packages/planche` (modèle v2, migration, rendu par éléments), historique, sélection / transformation / magnétisme, barre haute + rail + inspecteur minimal, texte en place, photo (recadrage), planches, export PNG / JPG / ZIP | Refaire à l'identique un carrousel v1 existant, plus vite, avec Ctrl+Z |
| **2 · Le poste de travail** | Les 10 modèles image, éléments, calques, guides et raccourcis complets, variables et éléments liés aux données, planches de journée, styles et propagation, projets / versions / `.llstudio`, pièces détachées, partage système, **mobile** (chips + feuilles), retrait de l'Habillage | Produire un carrousel d'aventure complet et deux stories sans quitter le studio, sur ordinateur et sur téléphone |
| **3 · Survol** | Pipeline séance (GPX horodaté, FC, cadence, pauses), scène 3D (terrain + imagerie + ciel), caméra Suivre + intro / clôture, HUD story et ses variantes de format, timeline et montage, préchargement, export MP4 (desktop) et WebM (repli) | Une story Survol de 30 s exportée en MP4 depuis un GPX Coros, publiée telle quelle |
| **4 · Finitions** | MP4 sur téléphone, moments photo, images clés de caméra, orbites, toponymes vecteur, FIT, 60 i/s, 720p pour appareils faibles, versions | Le tour de Coros / Strava dépassé sur la durée, le montage et l'habillage |

### 8.3 Risques et points à vérifier

- **Conditions d'usage des tuiles** : Esri World Imagery dans une vidéo publiée (attribution obligatoire, vérifier la licence) ; MapTiler avec clé comme solution propre si besoin. Les tuiles Terrarium d'AWS sont libres avec attribution.
- **Mémoire sur iOS** : un canvas 1080 × 1920 + WebGL + encodeur ; prévoir le 720p et l'export par segments.
- **Rendu déterministe** : `preserveDrawingBuffer` et attente de `idle` avant chaque capture ; tester sur GPU intégré.
- **WebCodecs** : Chrome, Edge, Safari 16.4+, Firefox récent ; le repli WebM doit rester honnête (temps réel = qualité dépendante de l'appareil).
- **Quotas IndexedDB** : les médias en Blob ; afficher l'usage, proposer le nettoyage.
- **Polices hors ligne** : déjà gérées par le service worker ; à reconduire dans `apps/studio`.

---
