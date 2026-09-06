# Système de contenu du site

Mode d'emploi du modèle de contenu de `apps/site`. Décrit les sortes de contenu, leur frontmatter, le routage,
les sections d'une aventure, les blocs réutilisables et les règles de build. Ce document n'est pas une loi :
il décrit l'état du système, et il se corrige quand le système change.

---

## 1. Les deux registres

Une seule règle gouverne le classement du contenu, et elle se décide à l'écriture :

> **Une page Aventure est factuelle et structurée. Le Blog est narratif et chronologique.**
>
> Si un paragraphe apparaît dans une page Aventure, il part dans le Blog et l'aventure n'en garde qu'une ligne
> et un lien. Si une liste de masses apparaît dans un billet, c'est un `paquetage` et il vit sur l'aventure.

Les deux surfaces ne peuvent donc pas contenir la même chose, et les index correspondants ne se ressemblent pas :
l'index Aventures est une étagère (peu d'objets, grands, avec cover), l'index Blog est un registre chronologique
dense, sans cover.

Corollaire technique : **un bloc de contenu a un seul fichier source.** Tout autre emplacement affiche une carte
qui lit l'index généré, jamais une copie du texte. Aucun contenu n'est dupliqué nulle part.

---

## 2. Les sortes de contenu

Quatre sortes de pages, deux blocs qui vivent à l'intérieur des billets.

| Sorte | Nature | Route |
|---|---|---|
| `aventure` | campagne : données, préparation, matériel, direct | `/aventures/<slug>` |
| `recit` | le texte long d'une campagne, illustré, partageable | `/aventures/<slug-aventure>/recit` |
| `billet` | entrée datée du carnet de bord | `/blog/<slug>` |
| `article` | document scientifique vivant, sourcé, révisé | `/science/<slug>` |

Index : `/aventures`, `/blog`, `/science`, `/labo`, `/services`.

Les blocs `Note` et `Protocole` n'ont pas de page propre. Ils sont écrits à l'intérieur d'un billet et adressés par
ancre. Voir §6.

---

## 3. Frontmatter

Champs communs à toutes les sortes : `sorte`, `titre`, `slug`, `statut`, `chapeau`.

`statut` vaut `brouillon` ou `publie`. **Le défaut est `brouillon`.** Voir §8.

### aventure

```yaml
sorte: aventure
titre: "Traversée de La Réunion en autonomie"
slug: "reunion-2025"
statut: publie
chapeau: "170 km et deux pitons, en autonomie complète, en sandales."
etat: termine            # termine | en-cours | en-preparation
campagne: { debut: 2025-09-29, fin: 2025-11-30 }
cover: "reunion-cover.webp"
resume:                  # chiffres affichés sur la carte d'index
  - "170 km"
  - "9 800 m D+"
  - "sandales"
recit: "ile-intense"     # slug du récit, absent s'il n'existe pas
sections: [...]          # voir §5
```

### recit

```yaml
sorte: recit
titre: "« L'île intense vous dites ? »"
slug: "ile-intense"
statut: publie
date: 2025-12-09
aventure: "reunion-2025"   # obligatoire
cover: "pitons.webp"
lecture: 12                # minutes
chiffres:                  # barre de chiffres sous le titre
  - "170 km"
  - "9 800 m D+"
  - "8,5 kg au départ"
  - "0 bâton"
```

### billet

```yaml
sorte: billet
titre: "Projet OFF Monts du Lyonnais"
slug: "monts-du-lyonnais"
statut: publie
date: 2026-03-14
type: recit-de-sortie      # recit-de-sortie | bilan | billet | note-de-terrain
chapeau: "65 km, trois gueux et de la neige."
aventure: "vercors-2026"   # rattachement facultatif
```

### article

```yaml
sorte: article
titre: "« Use it or lose it », vous êtes sûr ?"
slug: "use-it-or-lose-it"
statut: publie
publie_le: 2026-02-22
revise_le: 2026-09-03      # affiché en évidence : c'est le marqueur de Science
themes: ["memoire-musculaire"]
chapeau: "Ce que le muscle garde quand on arrête."
lecture: 9
refs: ["gundersen2016", "bonaldo2013", "encarnacao2022", "buxton2024"]
revisions:
  - { date: 2026-09-03, quoi: "section 3 et référence [4] ajoutées" }
```

---

## 4. Une aventure n'a pas de gabarit

**Une page Aventure est une liste ordonnée de sections déclarées dans le frontmatter.** Aucune section n'est
obligatoire, l'ordre est libre, et la liste s'allonge en cours de campagne. Il n'existe pas de gabarit par type
d'aventure : un « template » n'est rien d'autre qu'une liste de départ qu'on modifie ensuite.

Trois exemples réels, volontairement dissemblables :

- **Réunion** : caracteristiques, geo, preparation, paquetage, nutrition, direct, recit
- **Costa Rica** : caracteristiques, geo, preparation, libre, libre, paquetage, nutrition, direct, recit
- **Écrins** : caracteristiques, libre, recit

La page à trois sections doit avoir l'air finie, pas amputée. C'est le cas de test du système.

Tout est saisi à la main. Aucune donnée n'est synchronisée depuis un service externe.

---

## 5. Les huit types de section

### caracteristiques
Fiche clé/valeur libre. Aucun champ imposé : Réunion déclare distance et dénivelé, Costa Rica déclare climat et
hébergement.

```yaml
- type: caracteristiques
  champs:
    - { label: "Distance", valeur: "170 km" }
    - { label: "Appui", valeur: "Sandales, sans bâtons" }
```

### geo
Carte plus tableau ordonné. Colonnes libres : `Trace` pour un trail (repères, km, D+ cumulé), `Itinéraire` pour un
voyage (étapes, jours, lieu).

```yaml
- type: geo
  titre: "Trace"
  carte: "reunion.geojson"
  gpx: "reunion.gpx"        # facultatif, produit le bouton de téléchargement
  colonnes: ["Repère", "km", "D+ cumulé"]
  lignes:
    - ["Saint-Denis, gare", "0", "0 m"]
```

### preparation
Quatre éléments **indépendants et tous facultatifs**. Une préparation peut n'avoir que des stresseurs.

```yaml
- type: preparation
  graphe:                       # facultatif
    abscisse: ["S1", "S2", "S3", "S4"]
    series:
      - { nom: "Distance", unite: "km", valeurs: [64, 104, 48, 117] }
      - { nom: "Dénivelé positif", unite: "m", valeurs: [2000, 4800, 1200, 5100] }
  seances:                      # facultatif
    colonnes: ["Date", "Sortie", "km", "D+", "Sac", "Ce qu'on éprouvait", "Billet"]
    lignes:
      - ["12/10/2025", "Tour du Taillefer", "39", "2 500 m", "6 kg", "Matériel et lyophilisé", "taillefer"]
  stresseurs:                   # facultatif
    travailles:
      - { nom: "Chaleur", dose: "7 jours", frequence: "quotidien", intensite: "effort léger",
          pourquoi: "Baisser la FC à effort égal, transpirer plus tôt, boire avant la soif." }
    non_travailles: ["Froid", "Jeûne"]
  protocoles: ["rest-step"]     # facultatif, ids résolus dans l'index des blocs
```

La dernière colonne de `seances` contient un slug de billet, résolu en lien. Les stresseurs ont un schéma fixe :
nom, dose, fréquence, intensité, pourquoi. `non_travailles` est un champ structuré, pas une phrase libre.

### paquetage
Référence un jeu de données de paquetage. Produit le tableau, les masses et l'export CSV.

```yaml
- type: paquetage
  ref: "reunion-2025"
```

### nutrition
Tableau à colonnes libres.

### libre
Section titrée acceptant texte, images et vidéos. Le corps vit dans le MDX de la page, dans un slot nommé ;
le frontmatter ne déclare que la position et le titre.

```yaml
- type: libre
  id: "mouvement-primal"
  titre: "Mouvement primal"
```

```mdx
<SectionLibre id="mouvement-primal">
Texte, photos avec légende, et vidéos.
</SectionLibre>
```

*Point à trancher à l'implémentation : si le setup MDX offre un idiome plus simple pour rattacher de la prose à une
position déclarée en frontmatter, le proposer.*

### direct
Versions du live-tracking, replay, journal de bord de la campagne.

### recit
Grande carte de renvoi vers `/aventures/<slug>/recit`, même motif que les cartes de protocole. Résolue depuis le
champ `recit` du frontmatter. Absente si le récit n'existe pas.

---

## 6. Les blocs et l'index généré

Deux blocs s'écrivent à l'intérieur d'un billet, dans le flux, sans changer de fichier.

```mdx
<Protocole id="train-low-eat-low" statut="en-test" n="1"
  titre="Train-low, Eat-low"
  objectif="Maximiser l'activation de l'AMPK et de PGC-1α"
  concepts="flexibilite-metabolique,jeune-intermittent"
  refs="marquet2016">

Footing à jeûn de 50 min avec accélérations en montée, déjeuner cétogène,
second footing d'1 h. Recharge glucidique au dîner.

**Sensations —** début de deuxième footing difficile, puis atténuation.
</Protocole>
```

`statut` d'un protocole : `hypothese`, `en-test`, `eprouve`, `abandonne`.
`Note` a la même forme, sans `statut` ni `n`, et sert aux notes scientifiques sourcées.

Les propriétés de liste s'écrivent en chaîne séparée par des virgules, jamais en accolades : une prop en accolades
revient dans l'AST MDX sous forme de code source à évaluer.

### Extraction

Un script de build parcourt tous les MDX, collecte les nœuds `Note` et `Protocole` et écrit `.generated/blocs.json` :

```json
{
  "type": "protocole",
  "id": "train-low-eat-low",
  "titre": "Train-low, Eat-low",
  "objectif": "Maximiser l'activation de l'AMPK et de PGC-1α",
  "statut": "en-test",
  "n": 1,
  "concepts": ["flexibilite-metabolique", "jeune-intermittent"],
  "refs": ["marquet2016"],
  "source": { "sorte": "billet", "slug": "nouveau-bloc", "titre": "Nouveau bloc d'entraînement" },
  "url": "/blog/nouveau-bloc#protocole-train-low-eat-low",
  "date": "2026-05-17"
}
```

### Résolution

N'importe quelle page affiche un bloc par sa carte :

```mdx
<VersProtocole id="train-low-eat-low" />
```

La carte lit l'index et affiche titre, objectif, statut et lien. **Elle ne recopie jamais le corps du bloc.**
Conséquence : renommer un protocole ou changer son statut met à jour toutes ses citations sans toucher à aucune
d'elles.

### Promotion

Quand un bloc mérite sa propre URL, son corps part dans un fichier dédié et le billet d'origine le remplace par
`<VersProtocole id="..." />`. **Le schéma de l'index ne change pas** : seule l'`url` pointe désormais vers une page
au lieu d'une ancre. Aucune page d'index n'est modifiée.

---

## 7. Règles portées par le code

Ces règles ne sont pas des consignes à retenir : elles décrivent des états que le code rend impossibles. Elles sont
consignées ici pour expliquer pourquoi les composants sont faits ainsi.

- **La numérotation des sections (01, 02, 03) et le sommaire latéral sont calculés depuis la position** dans le
  tableau `sections`. Rien n'est écrit en dur, donc insérer une section renumérote tout.
- **Les ancres sont dérivées du slug** de la section ou du bloc, jamais du numéro. `#preparation`, pas
  `#03-preparation`. Insérer une section ne casse aucun lien existant.
- **Les composants posent leurs propres ancres.** Aucune ancre n'est écrite à la main, donc aucune ne peut diverger
  de celle que l'index calcule.
- **Les accents de couleur sont deux jetons**, l'un pour fond sombre, l'autre pour fond clair. La combinaison
  illisible n'existe pas.
- **L'accroche est un composant de la charte**, en romain maigre. On ne peut pas lui appliquer un italique par
  distraction.
- **Les chapeaux de cartes sont en romain.** L'italique est réservé aux légendes, au bloc « Sensations » et aux
  mentions de version du Direct.
- **Le filtre par thème de `/science` est dérivé du contenu** et masqué tant qu'il n'existe pas au moins deux thèmes
  contenant chacun au moins deux articles. Un thème sans article n'existe pas.
- **L'index Blog ne rend pas de cover.** Les covers vivent sur les pages de destination.

---

## 8. Publication, brouillons, fixtures

**Le statut par défaut d'un contenu est `brouillon`.** Une page sans `statut: publie` explicite n'est pas routée,
n'apparaît dans aucun index et ne figure pas au sitemap. Un contenu inventé ou incomplet est donc invisible sans
que personne ait eu à le repérer.

**Les fixtures vivent dans `content/__fixtures__/`**, exclu du glob de contenu et du routage. Tout ce qui sert à
démontrer un gabarit sans exister vraiment y va.

**Une donnée manquante s'écrit `TODO` en clair.** Jamais de valeur vraisemblable : un trou visible vaut mieux
qu'une invention plausible, qu'on ne retrouvera pas.

Sur l'accueil, le bloc Aventures affiche le récit d'une campagne quand il existe, sinon la carte de la campagne.
La carte de récit porte le nom de l'aventure en surtitre et le titre du récit en titre. L'action est « Lire le
récit » sur une campagne terminée, « Suivre la campagne » sur une campagne en cours. Tri sur la date de l'événement
le plus récent.

---

## 9. Validation au build

Le build échoue, avec le message indiqué. Aucun avertissement silencieux.

| Condition | Message |
|---|---|
| Deux blocs partagent un `id` | `id de bloc en double : "<id>" dans <fichier A> et <fichier B>` |
| Une carte pointe vers un `id` absent de l'index | `<VersProtocole id="<id>"> dans <fichier> : aucun bloc ne porte cet id` |
| Une clé de `refs` absente de la bibliographie | `référence inconnue : "<clé>" dans <fichier>` |
| Un `type` de section inconnu | `type de section inconnu : "<type>" dans <fichier>` |
| Deux sections d'une même page produisent la même ancre | `ancre en double : "<ancre>" dans <fichier>` |
| Un `recit` pointe vers un slug inexistant | `récit introuvable : "<slug>" déclaré par <fichier>` |
| Une `aventure` déclarée par un billet ou un récit n'existe pas | `aventure introuvable : "<slug>" déclarée par <fichier>` |
| Une section `paquetage` référence un jeu de données absent | `paquetage introuvable : "<ref>" dans <fichier>` |
| Un slug de billet en dernière colonne de `seances` n'existe pas | `billet introuvable : "<slug>" dans <fichier>` |
| Un frontmatter ne valide pas son schéma Zod | message Zod, préfixé du chemin du fichier |

Les schémas Zod vivent dans `packages`, pas dans `apps/site`.

---

## 10. Bibliographie

Une source unique, clé → entrée bibliographique, avec DOI quand il existe. `refs` en frontmatter (articles) ou en
prop (blocs) contient des clés. Les appels de référence sont numérotés par page, à l'affichage : la numérotation
n'est jamais écrite dans le contenu, donc déplacer un bloc ne casse rien.

---

## 11. Migration

Le journal 2026 se scinde en trois campagnes, par **intention déclarée dans le texte**, pas par chronologie :
Vercors–Drôme, Tour des Écrins, Nice by UTMB. Le bloc d'entraînement du 17 mai vise explicitement Nice, pas les
Écrins.

Le projet Réunion se scinde en une page Aventure, un récit et des billets.

Les sorties OFF (Monts du Lyonnais, Chartreuse, Aravis) sont des billets rattachés à la préparation d'une campagne,
pas des aventures autonomes.

Redirections 301 depuis `/comprendre`, `/explorer`, `/pratiquer`. Les ancres des anciennes pages ne sont pas
conservées : un fragment d'URL n'étant pas envoyé au serveur, une 301 ne peut pas router dessus, et le contenu est
réécrit de toute façon.

Le canonical du site actuel pointe vers `thelocomotionlab.com` alors que les pages sont servies sur
`www.thelocomotionlab.com`. Choisir une version, 301 l'autre, aligner le canonical.