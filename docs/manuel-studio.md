# Manuel du studio — Locomotion Lab

> **À qui ça s'adresse :** toi, devant le studio, un GPX dans un dossier et une story à publier.
> Ce document dit **comment faire les choses**, pas comment le code marche. L'architecture est
> dans [`CLAUDE.md`](../CLAUDE.md), le déploiement dans [`deploy-cloudflare.md`](./deploy-cloudflare.md).
>
> Adresse : **studio.thelocomotionlab.com**. Tout se passe dans le navigateur — aucune trace, aucune
> photo, aucun projet ne part sur un serveur.

---

## 0. Les cinq gestes qui font tout le reste

| | |
|---|---|
| **Cliquer** un élément de la planche | le prendre, avec ses poignées |
| **Double-cliquer** | entrer dedans : le caret dans un texte, le recadrage dans une photo |
| **Glisser** | déplacer ; les coins redimensionnent, la poignée du dessus tourne |
| **Ctrl + glissé** ou **molette** | déplacer la vue ; **Ctrl + molette** zoome sous le curseur |
| **`?`** | la liste complète des raccourcis |

Le reste est du réglage : le **rail** de gauche sert à **ajouter**, l'**inspecteur** de droite à
**régler ce qui est choisi**. C'est toute la logique du poste — si tu cherches un réglage, il est
à droite ; si tu cherches à poser quelque chose, il est à gauche.

---

## 1. Un carrousel d'aventure, du GPX à l'export

### 1.1 Charger la trace

**Données → Charger une trace.** GPX de montre ou `.track.json` de la balise. Plusieurs fichiers se
recollent bout à bout dans l'ordre choisi — c'est ainsi qu'un tour de six jours enregistré en six
sorties devient un seul itinéraire.

Le tiroir affiche alors ce que le studio a lu : distance, D+, D−, nombre de points, et si la trace
est **vécue** (elle porte des horaires : c'est une sortie) ou **prévue** (pas d'horaires : c'est un
itinéraire). Les modèles s'adaptent — « LA SORTIE » ou « L'ITINÉRAIRE ».

### 1.2 Découper en journées

Toujours dans **Données**, le champ **Découpage régulier** coupe la trace en *n* parts égales. Les
journées obtenues s'affichent avec leur distance et leur D+.

> La somme des journées fait exactement le total du tour. Si tu vois un écart, c'est un bug —
> dis-le-moi.

### 1.3 Poser les planches

**Modèles** propose dix mises en page. Choisir un modèle **recompose la planche courante sans perdre
ce qui est écrit** : un titre reste un titre, même si sa place change du tout au tout.

Pour un tour, le plus rapide est le bouton **« + Les N journées »** : il pose une planche par jour,
d'un coup, en **une seule étape d'historique** (un Ctrl+Z les retire toutes). Chaque planche est
réglée sur sa journée, et les vignettes de la bande du bas disent **J1, J2, J3** plutôt que quatre
fois le même nom de modèle.

### 1.4 La tranche de journées

C'est le réglage qui fait une planche d'étape, et il vit dans l'**inspecteur** quand rien n'est
sélectionné, section **JOURNÉES** :

- **Le tour** — l'itinéraire entier ;
- **L'avancement** — jusqu'au soir du jour N, la planche qui dit où on en est ;
- **La journée** — ce jour-là seulement.

**Carte, profil et chiffres suivent la même tranche.** Il n'y a qu'un réglage, à un seul endroit.

### 1.5 Écrire

Double-clic sur un texte : le caret entre dans l'image, à la bonne taille, à la bonne place. Le
balisage est court :

| | |
|---|---|
| `*gras*` | gras |
| `_italique_` | italique |
| `[ambre]` | à la couleur d'accent |
| `- point` | une puce ; `- :sac:` met une icône en puce |
| `{distance}` | une variable — voir plus bas |

Entrée fait une ligne. (Si tu importes un vieux document et que la mise en page se recolle, décoche
« Entrée fait une ligne » dans l'inspecteur : c'était le pli de la v1.)

### 1.6 Les variables

Écrites entre accolades dans n'importe quel texte, elles se remplissent depuis la trace **et suivent
la tranche de la planche** : `{distance}` sur une planche d'étape donne la distance de l'étape.

`{distance}` `{dplus}` `{dmoins}` `{duree}` `{allure}` `{vitesse}` `{fc_moy}` `{fc_max}` `{cadence}`
`{alt_max}` `{jour}` `{jour_distance}` `{jour_dplus}` `{nom}` `{date}` `{planche}` `{planches}`

La liste complète, cliquable, est en bas du tiroir **Données**.

### 1.7 Les photos

**Médias → Importer des photos** (le HEIC de l'iPhone est accepté). Ensuite, deux façons de poser :
choisir un cadre sur la planche puis cliquer la vignette, ou **lâcher le fichier directement sur la
planche** — la photo se pose là où tu l'as lâchée.

**Double-clic sur une photo = recadrage.** La planche passe sous un voile, la photo entière apparaît
en sourdine, et la part retenue reste à pleine lumière dans son cadre, règle des tiers comprise. On
voit ce qu'on écarte. Glisser fait passer la photo sous le cadre, la molette zoome dedans, **Entrée**
valide.

### 1.8 Exporter

**Ctrl+E**, ou le bouton **Exporter**.

- **Planches** — toutes ou la courante, en JPG à 92 % ou en PNG, à 1× (réseaux) ou 2× (impression).
  L'échelle 2× **redessine** la planche deux fois plus grande : les lettres restent nettes.
- **Pièces** — la trace, la carte, le profil ou la marque, **seuls, en PNG transparent**, à la
  largeur voulue. C'est ce qu'on va chercher pour poser une silhouette sur une affiche.
- Sur téléphone, **Partager** ouvre la feuille du système : la story part dans Instagram sans passer
  par le dossier Téléchargements.

---

## 2. Le Survol — la sortie rejouée sur le relief

C'est l'équivalent du *flyover* de Coros et de Strava : la caméra suit le point pendant qu'il
avance sur la carte en trois dimensions, et les chiffres défilent avec lui.

### 2.1 Ce qu'il faut

**Une séance, c'est-à-dire un GPX HORODATÉ** — celui que sort la montre. Un itinéraire tracé à la
main (Komoot, un `.track.json`) n'a pas d'horaires : le survol fonctionne quand même, à vitesse
constante, mais l'allure et la fréquence cardiaque n'ont rien à dire.

Charge-le dans **Données** comme une trace ordinaire. Le tiroir affiche alors « Séance : chargée ».

### 2.2 Poser le survol

**Modèles → + Survol**, en bas du tiroir. Une planche de survol s'ajoute à la suite, et le studio y
saute. Elle se distingue des autres : à la place de la planche, une scène 3D ; sous elle, une
timeline ; à droite, trois familles de réglages au lieu de l'inspecteur habituel.

### 2.3 Regarder

- **▶** lit le survol à la cadence du montage ; **⏮** revient au début.
- Le **curseur** de la timeline saute n'importe où — la caméra y est exactement ce qu'elle serait en
  lisant depuis le début. Il n'y a pas de « position approchée ».
- Le compteur dit où on en est : `12,4 s / 30 s`.

### 2.4 La scène — ce qu'on voit dessous

| Réglage | Ce qu'il fait |
|---|---|
| **Satellite** | l'imagerie aérienne d'Esri — le rendu le plus proche de Coros |
| **Relief** | la carte topographique d'Esri, plus lisible pour un itinéraire |
| **Topo** | OpenTopoMap, avec ses courbes de niveau |
| **Aucun** | ni photo ni carte : le terrain nu et la trace, une silhouette |
| **Ciel et brume** | l'horizon aux couleurs de la charte plutôt qu'un bleu générique |
| **Épaisseur de la trace** | 2 à 16 — 6 par défaut |

Le relief lui-même vient toujours des tuiles d'altitude d'AWS, quel que soit le fond : c'est le
bombé du terrain, pas ce qui est peint dessus.

### 2.5 La caméra — d'où on regarde

| Mode | Ce qu'il fait |
|---|---|
| **Suivre** | derrière le point, dans le sens de la marche. C'est le mode du flyover. |
| **Orbite** | la caméra tourne autour du point, qui reste au centre. Pour un col, un sommet. |
| **Ensemble** | tout l'itinéraire vu de haut, avec une lente dérive. Pour ouvrir ou clore. |

Puis quatre réglages, et deux d'entre eux décident si la vidéo est regardable :

- **Inclinaison** (0 → 80°) : 0 est vu du dessus, 60 est l'inclinaison du flyover.
- **Relief** (1 → 2×) : l'exagération du terrain. 1,3 donne des montagnes crédibles ; 2 en fait des
  Alpes de dessin animé.
- **Douceur du cap** (0,5 → 12 s) : sur combien de secondes la caméra lisse la direction. Court,
  elle colle aux lacets et ça tremble ; long, elle vire en retard et c'est ample.
- **Rotation maximale** (5 → 90 °/s) : le plafond. **Quoi qu'il arrive, la caméra ne tourne jamais
  plus vite que ça** — c'est ce qui empêche une épingle de donner la nausée. 25 °/s par défaut.
- **Zoom automatique** : serré quand ça monte lentement, large quand ça descend vite. Décoche-le
  pour imposer un zoom fixe.

### 2.6 Le montage — à quel rythme

- **Durée** : 15, 30, 60 ou 90 s. *(Rappel : une story accepte 60 s par segment.)*
- **À la distance** — le point avance d'un pas régulier, et une longue montée passe vite.
  **Au temps** — fidèle à la sortie : on voit le point ralentir dans la pente. Le **mélange** va de
  l'un à l'autre, parce que les deux ont tort seuls : à la distance on perd l'effort, au temps une
  pause de dix minutes mange la vidéo.
- **Retirer les pauses** : les moments où la montre tournait sans que personne avance. Coché par
  défaut, sans quoi un quart de la vidéo se passe devant un refuge.
- **Tenue au départ / à l'arrivée** : le temps d'arrêt sur la première et la dernière image, pour
  qu'on ait le temps de lire.

Le tiroir annonce le compte : *« 900 images à 30 par seconde »*.

### 2.7 L'habillage

Les chiffres, le titre et le profil posés sur la scène **sont des éléments de planche ordinaires** :
on les prend, on les déplace, on les règle exactement comme sur une image fixe. Les quatre chiffres
du haut sont réglés sur **distance, allure, altitude, FC** — et ils **défilent avec le point**,
parce qu'ils lisent l'instant et non le résumé de la sortie.

Si tu veux d'autres chiffres, choisis-en un et change sa variable dans l'inspecteur. `{altitude}` et
`{fc}` sont les deux variables *d'instant* : elles n'ont de sens que sur un survol.

Le **profil du bas se remplit jusqu'au point**, image après image, la part restante en sourdine :
c'est ce qui dit d'un coup d'œil où l'on en est dans la sortie, mieux qu'aucun chiffre.

### 2.8 Exporter la vidéo

Le bouton **Vidéo**, à droite de la timeline.

Chaque image est **dessinée et attendue une par une** — pas enregistrée en direct. C'est plus lent,
et c'est le seul moyen d'obtenir le même fichier sur toutes les machines, sans image sautée.
Le dialogue montre l'image en cours et une estimation.

- Compte **une à trois minutes** pour 30 s de vidéo sur un portable, davantage sur téléphone.
- **Laisse l'onglet au premier plan** : une scène 3D ne se dessine pas en arrière-plan.
- Le fichier sort en **MP4 (H.264)** là où le navigateur sait l'encoder — Chrome, Edge, Safari. Sur
  un navigateur sans codec propriétaire, il sort en **WebM (VP9)**, par le même chemin image par
  image. Le nom suit le projet : `col-du-lautaret-survol.mp4`.

### 2.9 Ce que le Survol ne fait pas encore

Pour que tu saches ce qui manque plutôt que de le chercher :

- pas de **toponymes** sur la scène (les noms de sommets et de cols) ;
- pas de **moments photo** — déposer une photo à un kilomètre pour qu'elle surgisse ;
- pas d'**images clés de caméra** : un mode vaut pour tout le survol ;
- pas de **préchargement des tuiles** avant l'export : les premières images peuvent attendre le
  réseau ;
- **le survol a besoin du réseau** (les tuiles), là où le reste du studio fonctionne hors ligne.

---

## 3. Le projet, et ce qui reste quand on ferme l'onglet

### 3.1 L'autosauvegarde est un filet, pas un projet

Le studio écrit un brouillon en continu, et le rouvre au démarrage. C'est tout ce qu'il fait tout
seul : ça évite de perdre une demi-heure sur un onglet fermé, mais ça n'est pas ranger son travail.

### 3.2 Ranger, vraiment

**Projets → Enregistrer** range le document sous son nom. Le champ **version** en garde un état sous
un nom à toi (« avant relecture ») sans quitter le document — pratique avant une refonte.

### 3.3 Le fichier `.llstudio`

**Projets → Exporter le projet.** Une archive qui emporte **le projet ET ses photos**. C'est ce qui
passe d'un navigateur à l'autre, de l'ordinateur au téléphone, et ce qui reste si les données du
site sont effacées.

C'est une archive ordinaire : renomme-la en `.zip` et tu y trouveras `studio.json`, lisible dans un
éditeur de texte, et un fichier par photo. Dans dix ans, même sans le studio, rien n'est perdu.

> **Fais-en un après chaque projet qui compte.** IndexedDB vit dans *ce* navigateur, sur *cet*
> appareil : un « effacer les données du site » emporte tout. Le tiroir affiche ce que le studio
> occupe et sur quel quota.

---

## 4. Sur téléphone

Sous 1024 px, le poste change de forme : la planche prend tout l'écran.

- **Sans rien de sélectionné** : trois actions en bas — **Ajouter** (une feuille avec les cinq
  tiroirs), **Planches (n)** qui déplie la bande, **Données**.
- **Avec une sélection** : une rangée de chips, et chaque chip ouvre **une feuille d'un seul
  réglage**, plafonnée à 40 % de la hauteur. La planche reste visible au-dessus, donc le réglage se
  voit en direct.
- **Deux doigts** pincent pour zoomer et déplacent la vue du même geste.
- Le document, le rendu et l'historique sont les mêmes qu'au bureau : un projet commencé sur
  l'ordinateur se finit sur le téléphone.

---

## 5. Quand ça ne va pas

| Ce que tu vois | Ce que c'est |
|---|---|
| La carte reste grise | les tuiles ne passent pas — réseau, ou un bloqueur de publicité qui filtre le fournisseur |
| Le survol reste noir | idem : le survol a besoin du réseau |
| Le texte se recolle en un paragraphe | décoche « Entrée fait une ligne » — ou coche-la, selon ce que tu veux |
| Un chiffre affiche `—` | la donnée n'existe pas : pas d'horaires pour une allure, pas de FC dans le fichier |
| L'export vidéo n'avance plus | l'onglet est passé en arrière-plan ; ramène-le devant |
| « Ce navigateur ne sait pas encoder de vidéo » | Safari < 16.4 ou un Firefox ancien : prends Chrome |
