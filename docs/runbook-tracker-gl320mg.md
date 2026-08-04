# Runbook — mettre en service le tracker GL320MG (SIM Simbase)

> **De la boîte à la carte du site.** Ce document part d'un GL320MG neuf + une SIM
> Simbase jamais activée, et s'arrête quand des points apparaissent sur `/live`.
>
> Voisins : [`live-tracking.md`](./live-tracking.md) (LE guide du live au quotidien —
> `./track`, carnet Telegram, archive) · [`runbook-vps.md`](./runbook-vps.md) (opérations
> VPS) · [`plan-staging.md`](./plan-staging.md) (mise en service d'ensemble).
>
> Outil compagnon : **`infra/scripts/check-tracker.sh`** teste les 5 maillons d'un coup.

---

## 0. La chaîne, et l'ordre dans lequel on la monte

```
 ①            ②                ③                ④              ⑤
SIM      →  tracker      →  Traccar      →  tracking-cache →  Caddy → /live
Simbase     GL320MG          VPS :5004       conteneur         JSON     site
activée     @Track/TCP       appareil=IMEI   ./track start     public
```

**On monte le serveur AVANT d'allumer le tracker** (§2 avant §3). Raison : si le
GL320MG se connecte à un Traccar qui ne connaît pas son IMEI, Traccar refuse la
session et le tracker repart en attente — tu perds du temps et de la batterie à
chercher une panne qui n'en est pas une.

Compte **1 h à 2 h** la première fois, dont un temps d'attente incompressible
(activation SIM, premier accrochage GPS à froid).

---

## 1. Étape ① — Activer la SIM Simbase

Une SIM Simbase arrive **inactive** : elle ne s'attache à aucun réseau tant que tu
ne l'as pas activée dans le tableau de bord. C'est la cause n°1 de « le tracker
clignote mais rien n'arrive ».

1. Crée / ouvre ton compte sur **[app.simbase.com](https://app.simbase.com)**.
2. **SIM cards → Add SIM / Activate** : renseigne l'**ICCID** (le long numéro
   imprimé sur la carte, ~19-20 chiffres ; note-le AVANT de l'insérer, c'est
   pénible à ressortir du tracker) et choisis le forfait data.
3. Vérifie que le statut passe à **Active** (compte ~1 min) et que le **roaming
   est activé** — c'est du roaming permanent, c'est le mode normal d'une SIM IoT.
4. Note l'**APN** affiché dans le tableau de bord.

**Réglages APN attendus** (à confirmer sur ta page Simbase, qui fait foi) :

| Réglage | Valeur |
| --- | --- |
| APN | `simbase` |
| Utilisateur / mot de passe | **vides** |
| Adresse IP | dynamique (DHCP) |
| Roaming | activé |

> ⚠️ **Consommation** : un rapport de position GTFRI pèse ~150-200 octets. À 30 s
> d'intervalle sur 5 jours ≈ **2 à 4 Mo** en comptant l'overhead réseau. Un petit
> forfait suffit largement — mais vérifie que le solde n'est pas à zéro, une SIM
> active sans crédit se comporte exactement comme une SIM non activée.

> ⚠️ **Réseau, en France, en montagne.** Le GL320MG parle **LTE-M (Cat-M1)**,
> **NB-IoT (Cat-NB2)** et **2G/EGPRS**. Deux conseils qui comptent pour les Écrins :
> - **Désactive NB-IoT** si l'option existe. NB-IoT est conçu pour des objets
>   FIXES : il gère mal le changement de cellule en déplacement, et une trace
>   coupée dans une montée n'est pas rattrapable.
> - **Garde LTE-M en principal et la 2G en repli**. La 2G française est en cours
>   d'extinction selon les opérateurs — c'est un filet de sécurité, pas un plan A.
>
> Dans tous les cas, la couverture LTE-M suit la couverture LTE : **les fonds de
> vallée resteront muets**. C'est le *store & forward* (§3.4) qui sauve la trace,
> pas le réseau.

---

## 2. Étape ② — Préparer le serveur (AVANT d'allumer le tracker)

### 2.1 Récupérer l'IMEI du tracker

L'IMEI (15 chiffres) est **l'identité du tracker pour Traccar**. Il est imprimé
sur l'étiquette au dos de l'appareil et sur la boîte. Note-le maintenant.

### 2.2 Déclarer l'appareil dans Traccar

Interface Traccar (`https://tracking.thelocomotionlab.com`, compte admin) :

1. **Paramètres → Appareils → +**
   - **Nom** : `GL320MG Écrins` (ou ce que tu veux, c'est cosmétique) ;
   - **Identifiant** : **l'IMEI, chiffres seuls**, sans espace ni préfixe.
2. Ouvre la fiche de l'appareil créé et **note son `id` numérique** (visible dans
   l'URL ou la colonne ID) — c'est le `DEVICE_ID` du back, à ne pas confondre avec
   l'IMEI.
3. **Partage l'appareil au compte `public`** (Paramètres → Utilisateurs → `public`
   → Appareils → cocher le nouveau). Sans ce partage, le token de `.env` lit
   `/positions` et reçoit une liste vide — panne silencieuse et déroutante.

### 2.3 Ouvrir le port balise 5004

Le GL320MG parle le protocole **Queclink**, que Traccar appelle **`gl200`**, en
**TCP sur le port 5004** — pas le 5055 de l'app téléphone, et pas le 443 du site.

```bash
sudo ufw allow 5004/tcp
sudo ufw status | grep 5004          # doit apparaître en ALLOW
sudo ss -tlnp | grep 5004            # Traccar doit déjà écouter (port actif par défaut)
```

Si le **pare-feu OVH Manager** est actif sur le VPS, ouvre aussi 5004/TCP côté
dashboard OVH — les deux pare-feux s'additionnent.

> **Pourquoi le DNS `tracking` doit rester en nuage GRIS (DNS-only).** Le proxy
> Cloudflare ne relaie que 80/443 : un tracker qui tape le 5004 doit joindre le
> **VPS en direct**. Passer ce DNS en orange couperait le tracker net.

### 2.4 Pointer le back sur le nouvel appareil

Dans `infra/.env` (sur le VPS, jamais dans le repo) :

```bash
DEVICE_ID=<l'id numérique noté en 2.2>
```

puis :

```bash
cd /opt/locomotionlab && git pull && cd infra && ./deploy.sh
```

### 2.5 Vérifier le socle avant d'aller plus loin

```bash
cd /opt/locomotionlab && ./infra/scripts/check-tracker.sh
```

À ce stade, **les étapes 1, 2, 4 et 5 doivent être vertes**. L'étape 3 dira
« statut inconnu / jamais de contact » : c'est normal, le tracker n'est pas encore
allumé. Si autre chose est rouge, corrige-le **maintenant** — chercher une panne
tracker sur un socle cassé fait perdre des heures.

---

## 3. Étape ③ — Allumer et configurer le tracker

### 3.1 Allumer

- SIM insérée (puce vers le bas, dans le sens du dessin du logement), **coque
  refermée** — le joint fait l'étanchéité.
- **Charge-le à fond avant le premier essai** (2-3 h). Un GL320MG à plat se
  comporte comme un GL320MG en panne.
- **Appui long sur le bouton** (~3-5 s) jusqu'à ce que les LED s'animent.
- Pose-le **dehors, ciel dégagé, immobile 5 à 15 min** : le premier accrochage GPS
  à froid est long (téléchargement des éphémérides). Sur un rebord de fenêtre à
  l'intérieur, il peut ne jamais accrocher — ce n'est pas une panne.

Les LED indiquent grosso modo : une pour le **réseau cellulaire**, une pour le
**GNSS**. Clignotement lent = accroché, rapide = en recherche. Le détail exact
(couleurs, cadences) est dans le **user manual** de ta version — c'est le seul
endroit qui fait foi.

### 3.2 Configurer : deux chemins

Le GL320MG sort d'usine **sans savoir où envoyer ses positions**. Il faut lui
donner l'APN (§1) et l'adresse du serveur (§2).

| Chemin | Quand | Risque |
| --- | --- | --- |
| **A. Outil Queclink par USB** ✅ recommandé | première mise en service | faible : des champs nommés, pas de virgules à compter |
| **B. Commandes @Track par SMS** | tracker déjà sur le terrain | réel : l'ordre des paramètres varie selon le modèle ET la version de firmware |

#### Chemin A — l'outil de configuration (recommandé)

Récupère l'outil de configuration Queclink (« Configuration Tool » / QCT) et le
**@Track Air Interface Protocol du GL320M Series** auprès de ton revendeur ou du
support Queclink (`support@queclink.com`) — Queclink ne publie pas ces fichiers en
libre accès. Branche le tracker en USB, et renseigne :

| Champ de l'outil | Valeur |
| --- | --- |
| APN | `simbase` (utilisateur / mot de passe vides) |
| Main server | `tracking.thelocomotionlab.com` |
| Main server port | `5004` |
| Protocole | **TCP** |
| Report interval (GTFRI) | `30` à `60` s |
| Buffer / store & forward | **ON** (cf. §3.4) |
| NB-IoT | **OFF** si l'option existe (cf. §1) |

C'est le chemin sûr : l'outil fabrique la commande à ta place, tu ne peux pas te
tromper d'ordre de champs.

#### Chemin B — par SMS (@Track)

Les commandes s'envoient **en SMS au numéro de la SIM du tracker** (une SIM data
Simbase n'a pas forcément de numéro entrant — vérifie avant de compter sur ce
chemin). Le squelette :

```
AT+GTBSI=<mdp>,simbase,,,,,,,FFFF$                       ← l'APN
AT+GTSRI=<mdp>,…,tracking.thelocomotionlab.com,5004,…$   ← le serveur
AT+GTFRI=<mdp>,…,30,…$                                   ← l'intervalle
```

- `<mdp>` = mot de passe de l'appareil. Chez Queclink, la valeur d'usine est le
  **nom du modèle en minuscules** (`gl300` pour un GL300, `gv350m` pour un GV350M…) —
  donc vraisemblablement **`gl320m`** ici. **À confirmer** dans ton manuel : trois
  commandes refusées d'affilée et certains modèles se verrouillent un moment.
- Chaque commande se termine par `$`, et l'avant-dernier champ est un numéro de
  série (`FFFF` convient).
- L'appareil répond par un ACK (`+ACK:GTBSI,…`) : **pas d'ACK = commande non prise**.

> ⛔ **Le point que je ne peux pas trancher à ta place.** Le **nombre exact de
> virgules** et la position de chaque paramètre dans `GTQSS` / `GTSRI` / `GTFRI`
> **changent d'un modèle Queclink à l'autre et d'une version de firmware à
> l'autre**. Les squelettes ci-dessus donnent la forme, pas la ligne à copier
> telle quelle. Recopie l'exemple du **@Track Air Interface Protocol de TON
> firmware** (§3.2 chemin A pour l'obtenir) — c'est la seule source fiable.
> Si tu me colles la page GTSRI/GTFRI de ce PDF, j'écris les trois lignes exactes.

### 3.3 Serveur : le domaine ou l'IP ?

Renseigne le **domaine** `tracking.thelocomotionlab.com` : si l'IP du VPS change
un jour, le tracker suit sans reconfiguration.

**Si le tracker ne se connecte pas**, teste l'IP brute du VPS à la place :
ça isole immédiatement un problème de **résolution DNS côté opérateur** (fréquent
en NB-IoT) d'un problème de réseau ou de port.

### 3.4 Store & forward — le réglage qui sauve la trace

Active le **buffer** (« store & forward », « buffer report »). Hors réseau,
l'appareil enregistre ses positions ; au retour du signal, il les renvoie **avec
leur heure GPS d'origine**. C'est ce qui fait qu'une vallée sans réseau devient
un simple trou de quelques minutes à l'affichage, puis se remplit.

Le back est prêt pour ça : `bufferLookbackMinutes` (défaut **180 min**, dans
`services/tracking-cache/tracking.config.json`) fait re-balayer les 3 dernières
heures à chaque passage, **pour que les points bufferisés arrivés en retard soient
bien récupérés** — sans quoi une position courante reçue avant la purge du buffer
créerait un trou définitif. Pour une sortie où tu attends des coupures **plus
longues que 3 h**, monte-le dans `infra/.env` :

```bash
BUFFER_LOOKBACK_MINUTES=720     # 12 h
```

(Aucun risque de doublon : le back dédoublonne par identifiant Traccar.)

---

## 4. Étape ④ — Vérifier que les positions arrivent

Tracker allumé, dehors, configuré :

```bash
cd /opt/locomotionlab && ./infra/scripts/check-tracker.sh
```

L'étape **3** du diagnostic est celle qui compte maintenant :

| Ce que dit le script | Ce que ça veut dire |
| --- | --- |
| statut **online** + positions sur 24 h | ✅ la chaîne matérielle est bonne, passe au §5 |
| statut **unknown**, jamais de contact | le tracker n'a **jamais** joint Traccar : IMEI, APN/SIM, ou serveur/port mal réglés |
| statut **offline** avec un dernier contact ancien | il a déjà parlé → config OK ; c'est du réseau ou de la batterie |
| appareil introuvable | l'IMEI saisi dans Traccar ne correspond pas, ou l'appareil n'est pas partagé au compte `public` |

Le **journal de Traccar** est l'endroit où l'on voit les connexions brutes arriver —
utile quand le script dit « jamais de contact » :

```bash
sudo tail -f /opt/traccar/logs/tracker-server.log | grep -i "gl200\|<IMEI>"
```

Une ligne mentionnant ton IMEI = **le tracker a joint le VPS**. Si tu vois l'IMEI
mais qu'aucune position n'est stockée, c'est que l'appareil n'est pas déclaré (ou
mal déclaré) côté Traccar — reviens au §2.2.

---

## 5. Étape ⑤ — Brancher sur le site et rendre `/live` testable

### 5.1 Ouvrir une session de collecte

Tant que tu n'as pas lancé `./track start`, le back est **volontairement au repos** :
il ne demande rien à Traccar et `live-positions.json` reste vide. La page reste en
« Avant ». Ce n'est pas une panne.

```bash
cd /opt/locomotionlab && ./track reset && ./track start
./track status         # points / distance doivent monter au fil des minutes
```

### 5.2 Basculer la page dans un état affichable

⚠️ `apps/site/lib/liveConfig.js` est aujourd'hui en **`statut: "termine"`** (l'archive
des 4x2000 de Chartreuse). Dans cet état, `/live` rend l'archive et **ignore
complètement** les données vivantes — le tracker peut émettre parfaitement, tu ne
verras rien.

**Pour un test, sans toucher au fichier** : pose la variable dans
`apps/site/.env.production` (cf. [`plan-staging.md`](./plan-staging.md) §1.4) —

```bash
NEXT_PUBLIC_LIVE_STATUT=avant
```

— puis déploie en staging :

```bash
pnpm install && pnpm -F site deploy:staging
```

`./track start` bascule alors la page en **« En cours »** toute seule. Retire la
ligne (ou repasse-la à `termine`) après le test.

> **Piège Next.js** : `.env.local` est lu par `next build` et **gagne** sur
> `.env.production`. Si `NEXT_PUBLIC_LIVE_STATUT` y traîne, même vide, c'est elle
> qui s'applique.

**Pour de bon (vraie aventure)** : édite `liveConfig.js` — `nom`, `dateDebut`,
`dates`, `intention`, `trace`, `waypoints`, et `statut: "avant"`. La marche à
suivre complète (génération de la trace GPX comprise) est dans
[`live-tracking.md`](./live-tracking.md) §3.

> La `trace` affichée reste celle de la config. Pendant un test avec la trace de
> Chartreuse, tes points de Lyon s'afficheront loin du tracé de référence — c'est
> normal et sans conséquence.

### 5.3 Regarder

Ouvre `https://staging.thelocomotionlab-website.pages.dev/live` : les points
doivent apparaître **en moins d'une minute** (la carte interroge toutes les 10 s,
le back collecte toutes les 15 s).

---

## 6. Recette — la sortie d'essai

Une fois la chaîne verte, un vrai test vaut mieux qu'un tableau de bord vert.
**Fais une sortie de 2-3 h** (pas un tour du pâté de maisons) avec le tracker
placé comme il le sera en course — **en haut du sac, ciel dégagé**.

- [ ] `./track reset && ./track start` avant de partir.
- [ ] Points sur `/live` en < 1 min, puis toutes les 30-60 s.
- [ ] **Traverse une zone sans réseau** (un tunnel, un fond de vallon) : le trou
      doit se **remplir tout seul** au retour du signal — c'est le test du
      store & forward, celui qui ne se simule pas.
- [ ] Distance / D+ affichés cohérents avec ta montre (à quelques % près).
- [ ] `./track status` au retour : nombre de points cohérent avec la durée.
- [ ] **Autonomie** : note le niveau de batterie au départ et à l'arrivée, et
      extrapole. La fiche constructeur suppose un intervalle bien plus lent que
      30 s — **seule ta mesure compte**.
- [ ] `./track stop` puis `./track reset` pour repartir propre.

La recette complète du live (carnet Telegram, messages visiteurs, cartes de
partage) est dans [`live-tracking.md`](./live-tracking.md) §13.

---

## 7. Pannes probables

| Symptôme | Cause la plus fréquente | Remède |
| --- | --- | --- |
| LED réseau clignote sans fin, jamais de contact Traccar | SIM non activée, ou APN non renseigné | §1 (statut **Active** dans le tableau de bord Simbase) puis §3.2 |
| Traccar dit **unknown**, jamais de position | IMEI mal saisi, ou serveur/port faux dans le tracker | §2.2 (IMEI = chiffres seuls) et §3.2 |
| Le tracker se connecte, Traccar ne stocke rien | appareil non déclaré : Traccar refuse une session inconnue | §2.2, puis vérifier le log `tracker-server.log` (§4) |
| `check-tracker.sh` : positions OK mais `/live` vide | pas de session ouverte, **ou** page en `statut: "termine"` | `./track start` (§5.1) **et** §5.2 |
| Trous dans la trace qui ne se remplissent jamais | buffer désactivé, ou coupure plus longue que le lookback | §3.4 : buffer ON + `BUFFER_LOOKBACK_MINUTES` |
| Ça marchait, plus rien depuis une heure | zone blanche (≠ panne) | attendre ; `./track status` ; puis §4 |
| Batterie vide bien avant l'heure annoncée | intervalle trop rapide, froid, recherche réseau permanente | allonger l'intervalle (60 s), batterie externe pour l'ultra |
| Connexion impossible depuis le tracker seulement | DNS `tracking` passé en nuage **orange** | le repasser en **DNS-only (gris)** — §2.3 |

---

## 8. Ce qu'il reste à confirmer sur ton matériel

Honnêtement, trois points de ce runbook viennent des conventions Queclink et non
de la doc de **ton** GL320MG, que Queclink ne diffuse pas publiquement :

1. **Le mot de passe d'usine** (`gl320m` supposé, par la convention « nom du
   modèle en minuscules »).
2. **L'ordre exact des paramètres** de `AT+GTQSS` / `AT+GTSRI` / `AT+GTFRI` (§3.2).
3. **Le détail des LED** et la durée d'appui exacte du bouton (§3.1).

Les trois se lisent dans le **user manual** + le **@Track Air Interface Protocol**
de ta version. Le chemin A (outil USB, §3.2) contourne les points 1 et 2
entièrement — c'est pour ça qu'il est recommandé.
