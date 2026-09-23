# Tuto — le carrousel « À 165 km de mon rêve »

> **Ce que c'est :** la marche à suivre, planche par planche, pour bâtir ce carrousel dans le studio.
> Chaque geste ci-dessous a été joué tel quel dans le studio ; les positions sont celles qui ont donné
> les rendus vérifiés. Les gestes de base (choisir, écrire, recadrer, exporter) sont dans
> [`manuel-studio.md`](./manuel-studio.md) — ici on ne redit que ce qui sert à CE carrousel.
>
> Document de chantier : quand le carrousel est publié, il va dans `docs/archive/`.

La planche 1 (ta photo de dos, « à 165 km de mon rêve ») n'est pas ici : modèle **Photo**, ta photo
en fond, le titre dessus — tu sais faire.

---

## 0. Avant la première planche

- **Barre du haut** : le nom du projet, le format **Carrousel · 1080×1350**, le thème **Clair** — c'est
  lui, le blanc labo.
- **Données → Charger une trace** : le GPX de la course. Donne-lui son **nom** juste dessous — c'est
  ce que `{nom}` écrit dans les titres.
- **Découpage régulier → 1.** La course d'un seul tenant : sans ça, la carte pose une étiquette « J1 »,
  « J2 » sur la trace et le profil se colore par journée.

Tout ce qui suit se règle dans l'**inspecteur** (à droite) une fois l'élément **cliqué** dans la
planche. La section **POSITION** en bas prend des pixels de planche : X, Y, Largeur, Hauteur.

---

## 1. Planche 2 — la course

*Des puces en haut sur le papier, la carte en bande dessous — la trace et son profil, rien d'écrit.*

1. **Modèles → Trace.** La carte prend la moitié basse de la planche et se fond dans le papier par
   ses deux bords ; la trace se cadre à la largeur du profil, posé au pied de la bande. Pas de
   titre, pas de chiffres : le haut de la planche est à toi.
2. **Texte → + Titre**, puis **POSITION → Y `190`, Hauteur `90`**. Écris-le (double-clic dans la
   planche, ou le champ de texte en haut de l'inspecteur).
3. **Texte → + Liste**, puis **Y `300`, Hauteur `250`**. Une puce par ligne, une icône en tête :

   ```
   - :montagne: 165 km · 9 800 m D+
   - :chrono: départ samedi 6 h, 40 h de barrière
   - :sac: assistance : Lolo et Rapace aux ravitos
   - :cible: objectif : finir debout
   ```

   Icônes qui vont bien ici : `montagne` `sommet` `chrono` `calendrier` `sac` `ravitaillement`
   `refuge` `secours` `eau` `gourde` `coeur` `cible` `lievre` `tortue`. La liste complète est dans
   **Éléments → Icônes**, avec un champ de recherche.
4. Pour monter ou descendre la bande : clique la carte, **POSITION → Y et Hauteur**. Les fondus
   suivent ses bords ; **DÉGRADÉS → Sa hauteur** dit sur combien de pixels chacun s'éteint. Le
   profil se prend à part : clique-le et déplace-le.

Une boucle reste une boucle : elle ne s'élargit pas pour remplir la bande. Un parcours en ligne,
lui, prend toute la largeur du profil.

---

## 2. Planche 3 — la préparation

*Les trois phases en puces, le graphique des semaines dessous.*

1. **« + » dans la bande du bas** (Ajouter une planche). Elle naît en modèle **Texte** : un surtitre,
   un titre, un corps.
2. **Surtitre** → `la préparation`. **Titre** → `17 semaines pour y arriver`. **Corps** →
   **Hauteur `300`**, puis les puces :

   ```
   - :montagne: montée en charge, S1 → S8
   - :choc: le WEC, S15 : 198 km
   - :cible: affûtage, S16 → S17
   ```

3. Dans le rail de gauche, **Éléments** — pas **Données** : ce tiroir-là ne sert qu'à la trace GPX —
   puis, dans sa rubrique **DONNÉES**, **Semaines**. Le graphique se pose sur la planche, déjà
   choisi. Dans l'inspecteur, à droite : **POSITION → Y `700`, Hauteur `540`**.
4. **Toujours dans l'inspecteur, à droite** : **RÉGLAGES → DONNÉES**, le grand champ de texte en
   tête. Remplace ce qu'il contient par ton bloc, tel quel —

   ```
   abscisse: ["S1", "S2", "S3", …, "S17"]
   series:
     - { nom: "Distance", unite: "km", valeurs: [77, 84, 94, …] }
     - { nom: "Dénivelé positif", unite: "m", valeurs: [3200, 3600, 4500, …] }
   ```

   La ligne d'aide dit ce qui a été lu (« 17 étiquettes et 2 séries lues »). Une accolade ou un
   crochet oublié en fin de bloc ne fait rien perdre.
5. **CE QU'ON MONTRE** : **En barres** → Distance (km) ; **En courbe** → Dénivelé positif (m), ou
   **Aucune** pour ne montrer que les kilomètres. **Barres** et **Courbe** règlent la couleur de la
   série ; le bouton **Thème** rend celle de la charte.
6. **AXES** : **Une étiquette sur `1`** (toutes les semaines), **Étiquettes → En biais · 45°**,
   les deux cases cochées (graduations chiffrées, nom des séries sur les axes), **Corps `22`**.
   Puis **AXE DES BARRES → Une graduation tous les `50`** : l'axe s'écrit 0 · 50 · 100 · 150 · 200.
   Le **Maximum** reste vide — automatique, un cran rond au-dessus de ta plus grosse semaine.
   **AXE DE LA COURBE** : même chose pour le dénivelé (vide, il donne 0 · 5k · 10k · 15k).
   **DESSIN** : les lignes de grille, la largeur des barres (72 % de la colonne par défaut), les
   pastilles sur la courbe.
7. **La couleur d'une barre** : le graphique choisi, **clique la barre** dans la planche. La barre
   contextuelle au-dessus affiche son étiquette (« S15 ») et cinq pastilles — Thème (la couleur de la
   série), Accent, Bleu-vert, Terracotta, Fuchsia. Pour le WEC : S15 → Fuchsia ; pour l'affûtage :
   S16 et S17 → Accent. **Tout remettre à la série** dans l'inspecteur annule d'un coup.
8. **LÉGENDE → Ajouter une ligne**, trois fois : la couleur et le mot — `montée en charge`, `WEC`,
   `affûtage`. Elle s'écrit sous le graphique.

Ce graphique est celui d'aujourd'hui. Les pistes pour le redessiner (phases en frise, dénivelé en
montagne sur la barre, deux histogrammes en miroir) changent le dessin, pas la saisie : le bloc de
données, les couleurs par barre et la légende restent les mêmes gestes.

---

## 3. Planche 4 — intentions et mantras

*La planche « Intentions / Mantras » de ton carrousel d'avant, relevée au pixel.*

1. **« + »**, puis **Modèles → Intentions** : deux rubriques en terracotta, une liste à icônes sous
   chacune — aux mesures de ta planche (rubriques à 295 et 817 px, points aérés).
2. Clique la première liste et écris :

   ```
   - :physiologie: Cultiver la *robustesse* physiologique
   - :choc: *Choquer* mon organisme un mois avant Nice by UTMB
   - :amis: Passer du temps entre *amis* dans l'effort
   ```

3. La seconde :

   ```
   - :animal: J'épouse l'inconfort en montagne avec *animalité*
   - :explorer: Je ne m'agenouille pas devant la *peur* mais navigue au travers
   - :loupe: *J'enquête* sur mes propres capacités d'adaptation
   ```

4. « Intentions » et « Mantras » sont les mots du modèle : ils se réécrivent comme n'importe quel
   titre. L'air entre deux points se règle sur la liste, **MISE EN PAGE → Entre les points** — 0,8
   ici, 0,35 dans la charte.

---

## 4. Planche 5 — à suivre en direct

1. **« + »**, puis **Modèles → Clôture** : la marque cerclée au centre, un titre centré dessous, pas de
   pied — une clôture ne se numérote pas et n'invite pas à glisser.
2. **Titre** → `À suivre en direct`.
3. **Texte → + Paragraphe**, **POSITION → Y `910`, Hauteur `120`**, **Centré** dans la barre
   contextuelle, puis : `Le lien du suivi est dans ma bio.` — ou avec l'icône : `:lien: le lien est
   dans ma bio`.
4. La marque : clique le cercle → **Variante** propose aussi « Logo et nom », « Logo seul », « Nom
   seul ».

---

## 5. Exporter

**Ctrl+E** (ou le bouton **Exporter**) → **Planches** → toutes, **JPG 92 %**, **1×**. Le dossier
Téléchargements reçoit une image par planche, numérotée dans l'ordre du carrousel.

---

## Ce qui a été vérifié, et comment

Les quatre planches ont été bâties par script dans le studio, exactement avec les gestes ci-dessus,
et capturées. Le GPX utilisé est celui du GR54 (la trace de la course n'est pas dans le dépôt), et
les mots des puces de la planche 2 sont des exemples — les tiens vont à leur place. Dans
l'environnement de vérification les tuiles de carte ne se chargent pas : sur ta machine, le fond
Esri apparaît sous la trace, comme sur les planches d'avant.

La planche Intentions a été mesurée ligne par ligne contre l'original : rubriques, points et
pied tombent à 2 px près ; seule la seconde liste est 8 px plus haute que sur l'original, où les
deux rubriques n'avaient pas tout à fait le même corps.
