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

*Des puces en haut sur le papier, la carte en dessous qui se fond dans le blanc, le profil dessus.*

1. La première planche naît en modèle **Carte** : la carte occupe toute la planche, le bloc
   « L'ITINÉRAIRE / nom / km · D+ » et le profil sont posés en bas.
2. **Clique la carte** (au milieu, là où il n'y a pas de texte) et descends-la : **POSITION → Y `560`,
   Hauteur `790`**. Elle garde toute la largeur ; le haut de la planche redevient du papier.
3. Toujours sur la carte, **DÉGRADÉS** (« Voiler pour le texte » est déjà coché) :
   **En-tête → `100 %`**, **Sa hauteur → `260` px**. Le bord haut de la carte se fond dans le blanc
   labo sur 260 px. Le **Pied** reste tel quel : c'est lui qui porte le bloc de titre.
4. **ÉTIQUETTES → décoche « Une par journée »** : plus de pastille « J1 » sur la trace.
5. **Texte → + Titre**, puis **POSITION → Y `190`, Hauteur `90`**. Écris-le (double-clic dans la
   planche, ou le champ de texte en haut de l'inspecteur).
6. **Texte → + Liste**, puis **Y `300`, Hauteur `250`**. Une puce par ligne, une icône en tête :

   ```
   - :montagne: 165 km · 9 800 m D+
   - :chrono: départ samedi 6 h, 40 h de barrière
   - :sac: assistance : Lolo et Rapace aux ravitos
   - :cible: objectif : finir debout
   ```

   Icônes qui vont bien ici : `montagne` `sommet` `chrono` `calendrier` `sac` `ravitaillement`
   `refuge` `secours` `eau` `gourde` `coeur` `cible` `lievre` `tortue`. La liste complète est dans
   **Éléments → Icônes**, avec un champ de recherche.
7. En bas, le modèle a déjà écrit **L'ITINÉRAIRE**, le nom de la trace et `{distance} km · {dplus}
   m D+`. Double-clic pour changer le titre ; les chiffres viennent du GPX.

Si tu veux la carte plus haute ou plus basse, ne touche qu'à **Y** et **Hauteur** de la carte : la
trace se recadre toute seule dans la partie visible, le profil et le titre ne bougent pas.

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

3. **Éléments → Semaines**, puis **POSITION → Y `700`, Hauteur `540`**.
4. **DONNÉES** : colle ton bloc tel quel dans le champ —

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

## 3. Planche 4 — la quête et les mantras

1. **« + »** : une planche **Texte**.
2. **Surtitre** → `la quête`. **Titre** → `Pourquoi 165 km`. **Corps** → le texte, avec le balisage :

   ```
   Parce que le rêve tient en une ligne : [finir], et rentrer raconter.

   *Un pas après l'autre.*
   *La nuit finit toujours.*
   *Manger avant d'avoir faim.*
   ```

   `[mot]` le met en ambre, `*mot*` en gras, une ligne vide fait un paragraphe, `| ` en début de
   ligne centre la ligne. Les mantras en gras, un par ligne : ils se lisent comme une liste sans
   puce.
3. Pour un mantra qui porte toute la planche : **Texte → + Titre**, pose-le au milieu, **Centré** dans
   la barre contextuelle, et laisse le corps du modèle pour le reste.

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
les mots des puces sont des exemples — les tiens vont à leur place. Dans l'environnement de
vérification les tuiles de carte ne se chargent pas : sur ta machine, le fond Esri apparaît sous la
trace, comme sur les planches d'avant.
