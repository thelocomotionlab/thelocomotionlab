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
2. **Partage l'appareil au compte `public`** (Paramètres → Utilisateurs → `public`
   → Appareils → cocher le nouveau). Sans ce partage, le token de `.env` lit
   `/positions` et reçoit une liste vide — panne silencieuse et déroutante.
3. **Relève son `id` numérique** — c'est le `DEVICE_ID` du back, à ne pas confondre
   avec l'IMEI (voir l'encadré ci-dessous).

> ### Où est passé le `deviceId` ?
>
> **Il existe dès la création de la fiche** : c'est la clé primaire en base,
> attribuée par Traccar sur-le-champ. Un appareil « Hors ligne » / « jamais
> connecté » **a déjà son id** — inutile d'attendre qu'il émette. Simplement,
> l'interface ne l'affiche nulle part. Trois façons de le lire :
>
> 1. **Par l'API publique** (la plus simple — et elle vérifie *en même temps* que
>    le partage au compte `public` de l'étape 2 est bien fait) :
>    ```bash
>    curl -s https://tracking.thelocomotionlab.com/api/public/devices | jq '.[] | {id, name, uniqueId, status}'
>    ```
>    Caddy injecte le token côté serveur : ni login ni secret à manipuler. Le
>    champ `id` est ton `DEVICE_ID`. **Liste vide → l'appareil n'est pas partagé
>    au compte `public`.**
> 2. **Par l'URL de l'UI** : clique l'icône **crayon** (modifier) sur la fiche de
>    l'appareil → l'adresse devient `…/settings/device/<id>`. Le nombre final est
>    l'id.
> 3. **Par le script**, si `DEVICE_ID` est encore faux ou absent : `check-tracker.sh`
>    (§2.5) liste tous les appareils visibles avec leur `#id`.

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

| Chemin | Quand | Statut |
| --- | --- | --- |
| **B. Commandes @Track par SMS** ✅ **la voie éprouvée ici** | toujours, y compris tracker déjà sur le terrain | **validé le 4 août 2026** : les trois commandes ci-dessous ont été ACK et les positions ont suivi |
| **A. Outil Queclink par USB** | si tu obtiens l'outil un jour | non testé — et attention, `/dev/ttyUSB2` est le port AT du **modem**, pas le canal @Track (§« Ce qui est confirmé ») |

> **Va directement au chemin B.** Les commandes exactes de notre appareil sont
> écrites plus bas, vérifiées champ par champ contre le PDF officiel et
> confirmées par les ACK reçus. Le chemin A n'a plus d'intérêt ici : il servait à
> éviter de compter les virgules, or elles sont désormais comptées.

#### Chemin A — l'outil de configuration

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

#### `AT+GTSRI` — les 16 champs, VÉRIFIÉS

Relevés dans le PDF officiel **`GL320M Series @Track Air Interface Protocol`,
réf. `QSZTRACGL320MAN0303`** §3.2.1.2 — c'est bien la version `C30303` que notre
appareil annonce dans ses ACK.

| # | Paramètre | Plage | Notre valeur |
| --- | --- | --- | --- |
| 1 | Password | 4-20 car. | `gl320m` |
| 2 | Report Mode | 0-7 | `3` = TCP long-connection |
| 3 | *Reserved* | — | vide |
| 4 | Buffer Mode | 0\|1\|2 | **`2`** (cf. ci-dessous) |
| 5 | Main Server IP/Domain | ≤60 | `tracking.thelocomotionlab.com` |
| 6 | Main Server Port | 0-65535 | `5004` |
| 7 | Backup Server IP/Domain | ≤60 | vide |
| 8 | Backup Server Port | 0-65535 | `0` |
| 9 | SMS Gateway | ≤20 | vide |
| 10 | Heartbeat Interval | 0\|5-360 min | `5` |
| 11 | **SACK Enable** | 0\|1\|2 | **`0`** (cf. ci-dessous) |
| 12 | SMS ACK Enable | 0\|1 | `1` (ACK par SMS des commandes) |
| 13 | Multi-packet Sending | 0\|1 | `0` (prudence, cf. ci-dessous) |
| 14 | DNS Lookup Interval | 0-1440 min | `60` |
| 15 | *Reserved* | — | vide |
| 16 | Serial Number | 4 HEX | `FFFF` |

```
AT+GTSRI=gl320m,3,,2,tracking.thelocomotionlab.com,5004,,0,,5,0,1,0,60,,FFFF$
```

**Les trois choix qui comptent :**

- **`SACK Enable = 0` (champ 11).** À `1`, l'appareil attend un `+SACK:` du serveur
  après *chaque* message. Traccar répond aux battements de cœur (`GTHBD`) mais
  n'acquitte pas chaque rapport de position : le tracker attend un accusé qui ne
  vient pas et **retransmet**. Symptôme observé le 4 août : des positions
  strictement identiques (même `fixTime`, mêmes coordonnées) empilées dans
  Traccar, et de la data consommée pour rien.
- **`Buffer Mode = 2` (champ 4).** Le mode 2 (« high priority ») envoie **tous les
  messages bufferisés AVANT les messages temps réel**. C'est exactement la garantie
  d'ordre qui manquait : elle supprime à la source le cas que
  `bufferLookbackMinutes` rattrape côté serveur (§3.4). Ceinture et bretelles.
- **`Multi-packet Sending = 0` (champ 13).** À `1`, l'appareil groupe plusieurs
  rapports bufferisés dans un seul paquet. Plus économe, mais on ne l'a pas
  vérifié contre le décodeur `gl200` de Traccar — et un vidage de buffer mal
  décodé, c'est une portion de trace perdue. On garde `0` tant que ce n'est pas
  testé.

#### `AT+GTFRI` — les 21 champs, VÉRIFIÉS

Même source, §3.2.2.10 « Fixed Report Information ». C'est **la commande qui fait
émettre le tracker à intervalle régulier** : sans elle (Mode = 0 par défaut),
l'appareil ne parle que sur événement — d'où une carte quasi vide et de la data
consommée surtout aux allumages/extinctions.

```
AT+GTFRI=gl320m,1,1,,,0000,0000,30,30,30,30,,1000,1000,0,5,50,5,0,00000000,FFFF$
```

21 champs, 80 octets (limite SMS : 160).

| # | Paramètre | Notre valeur | Pourquoi |
| --- | --- | --- | --- |
| 2 | Mode | `1` | rapport à intervalle de temps fixe |
| 3 | **Discard No Fix** | **`1`** | **ne rien envoyer sans fix GPS** (cf. ci-dessous) |
| 6-7 | Begin / End Time | `0000` / `0000` | égaux = actif 24 h/24 (règle du §3.2.2.10) |
| 8-9 | Check / Send Interval | `30` / `30` s | un point toutes les 30 s |
| 10-11 | Ignition Check / Send | `30` / `30` s | pas d'entrée ignition ici : mêmes valeurs, comportement identique quel que soit l'état supposé |
| 13-14 | Distance / Mileage | `1000` | inutilisés en Mode 1, laissés au défaut |
| 15 | Movement Detection | `0` | désactivé pour la mise au point (cf. ci-dessous) |
| 19 | Corner | `0` | pas de rapport supplémentaire dans les lacets |
| 20 | ERI Mask | `00000000` | on veut des `+RESP:GTFRI`, pas des `GTERI` |

**`Discard No Fix = 1` — le réglage qui nettoie la trace.** À `0` (« report last
known GPS position if there is no GPS fix »), l'appareil rejoue sa dernière
position connue quand il ne voit pas le ciel : Traccar les stocke en
`valid: false`, et la carte montre un coureur **figé** au lieu d'un trou. À `1`,
il se tait — et le trou est justement ce que la page sait afficher (« zone
blanche »). C'est la cause des positions `valid: false` observées le 4 août.

**Deux contraintes du PDF à ne pas violer :**

- **ratio `Send Interval` / `Check Interval` ≤ 15**, sinon « the command will be
  discarded and the previous settings will be kept unchanged » — un refus
  silencieux. Ici 30/30 = 1.
- **`Check Interval` < 60 s ⇒ la puce GPS ne s'éteint jamais.** C'est ce qu'on
  veut pour une trace fine, mais **c'est le premier poste de consommation
  batterie**. Pour une sortie de plusieurs jours, mesurer l'autonomie réelle à
  30 s (§6) avant de décider ; passer à `60`/`60` éteint la puce entre deux fix.

**Deux options pour la vraie aventure** (laissées désactivées pour la mise au point) :

- **`Movement Detection = 1` (champ 15)** : à l'arrêt, l'appareil n'envoie que
  `Movement Send Number` rapports puis se tait jusqu'au prochain mouvement.
  Vraie économie de batterie **pendant les nuits au bivouac**.
- **`Corner = 30` à `45` (champ 19)** : ajoute un point quand le cap change de
  plus de N degrés — capte les lacets qu'un rapport purement temporel coupe en
  ligne droite. Coût : plus de points, donc plus de data et de batterie.

#### Ce qui est CONFIRMÉ sur notre appareil (IMEI 860201069202698)

Relevé en conditions réelles le 4 août 2026, par SMS via le tableau de bord Simbase :

- **Le mot de passe d'usine est bien `gl320m`.** L'ACK reçu le prouve :
  `+ACK:GTSRI,C30303,860201069202698,,FFFF,20260804162604,0000$` — un mot de passe
  refusé ne produit aucun ACK.
- **Le numéro de série `FFFF` fonctionne.**
- **La version de protocole est `C30303`** (2ᵉ champ de l'ACK) : c'est elle qui
  désigne le PDF applicable. Un @Track Air Interface Protocol d'une autre version
  peut avoir un ordre de champs différent.
- **`GTBSI` (APN) et `GTSRI` (serveur) sont acceptés** dans la forme envoyée : le
  tracker a joint Traccar et y a déposé des positions.
- **`GTFRI` a été REFUSÉ** dans la forme essayée — cause trouvée : la commande
  envoyée n'avait que **15 champs au lieu de 21**, et les valeurs étaient décalées
  (l'intervalle de 30 s tombait dans `End Time`). Forme correcte ci-dessus.
- **`GTBSI` (APN) : `Network Mode = 0` + `LTE Mode = 2`** donne l'ordre de
  recherche **M1 → 2G**, sans NB-IoT (table §3.2.1.1 du PDF) — c'est bien ce qu'on
  veut pour un appareil en mouvement (cf. §1). En revanche le **GPRS APN
  (champ 5) est resté vide** : à vérifier si le repli 2G doit fonctionner.

> **Le port USB n'est pas le bon canal.** Sur `/dev/ttyUSB2`, `AT+CSQ` et `AT+CCLK`
> répondent normalement mais `AT+GTFRI` renvoie `ERROR` : on parle à l'interface AT
> **du modem cellulaire**, qui ignore les commandes propriétaires Queclink. C'est
> cohérent — un port @Track refuserait au contraire `AT+CSQ`. **Passe par SMS**,
> qui est démontré fonctionnel ici (l'ACK GTSRI ci-dessus).

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

### 3.5 La configuration optimisée — les quatre commandes

Les réglages de §3.2 font *fonctionner* le tracker. Ceux-ci le font **bien
suivre** : trace fine en mouvement, pas de dérive à l'arrêt, batterie ménagée.
Toutes vérifiées champ par champ contre le PDF officiel.

> ⚠️ **L'ordre compte.** `GTCFG` d'abord : il pose `GPS On Need`, dont dépendent
> le mode 6 et le report d'angle de `GTFRI`. Chaque commande doit renvoyer un
> `+ACK:` — sans ACK, elle n'est pas passée.

```
1. AT+GTCFG=gl320m,gl320m,gl320m,0,0.0,2,10,001F,,,0FFF,0,1,1,300,2,0,20491231235959,1,0000,0,20,1,,FFFF$
2. AT+GTFRI=gl320m,6,1,,,0000,0000,30,30,30,30,,1000,50,1,1,20,5,45,00000000,FFFF$
3. AT+GTNMD=gl320m,E,10,3,2,300,300,2,3,0,0,2,,,FFFF$
4. AT+GTFKS=gl320m,1,1,5,1,1,3,2,8,4,3,FFFF$
```

#### Ce que chaque réglage apporte

**`GTCFG` (25 champs) — la qualité du fix.**

| # | Paramètre | Valeur | Effet |
| --- | --- | --- | --- |
| 6 | GPS On Need | **`2`** | GPS allumé **en mouvement**, éteint **au repos**. Le meilleur des deux : précision quand ça compte, batterie économisée au bivouac. Exigé par le mode 6 et le report d'angle. |
| 7 | GPS Fix Delay | **`10`** s | le PDF prévient que « la position obtenue immédiatement après le fix peut être inexacte » : on attend 10 s au lieu de 5 avant de lire. |
| 19 | AGPS Mode | **`1`** | **désactivé par défaut !** Améliore le taux d'accroche et raccourcit le temps de fix — décisif en fond de vallée et au démarrage à froid. |
| 23 | **Walking Mode** | **`1`** | *« aide l'appareil à obtenir de meilleures informations d'azimut et de vitesse pendant la marche »*. Littéralement fait pour ton usage — et désactivé d'usine. |
| 22 | Battery Low % | **`20`** | alerte `+RESP:GTBPL` à 20 % au lieu de 10 : de la marge pour réagir. |
| 14-15 | Info Report | `1` / `300` s | le rapport d'état qui porte **la batterie** (§3.7). |
| 8 | Report Item Mask | `001F` | garde l'**altitude** (bit 2) — sans elle, pas de D+. |

> `GSM Report` (champ 20) reste à `0000` : le PDF précise que `+RESP:GTGSM`
> n'est envoyé qu'en **TCP short-connection**, or on est en long-connection.
> Ça ne servirait à rien ici.
>
> ⚠️ Le champ 2 est **New Password** : on y remet `gl320m` pour le laisser
> inchangé. Ne le laisse jamais vide au hasard.

**`GTFRI` (21 champs) — la densité de points.**

| # | Paramètre | Valeur | Effet |
| --- | --- | --- | --- |
| 2 | Mode | **`6`** | « Fixed Time **ou** Mileage » : un point tous les **30 s OU tous les 50 m**, au premier des deux atteint. C'est le réglage que tu demandais. |
| 14 | Mileage | **`50`** m | la distance qui déclenche un point hors délai. |
| 19 | **Corner** | **`45`°** | ajoute un point dès que le cap change de plus de 45° : **capte les lacets** qu'un rapport purement temporel coupe en ligne droite. Descendre à `30` densifie encore, au prix de data et de batterie. |
| 15-18 | Movement Detection | `1`, `1` km/h, `20` m, `5` | **le remède direct à la dérive à l'arrêt** : sous 1 km/h ET moins de 20 m de déplacement, l'appareil se tait après 5 rapports. Les deux conditions sont cumulatives — une montée raide à 1,5 km/h reste « en mouvement » grâce au critère de vitesse (que Walking Mode rend justement fiable). |
| 3 | Discard No Fix | `1` | rien n'est envoyé sans fix : un trou plutôt qu'un coureur figé. |

**`GTNMD` (15 champs) — l'économie au repos.** Détection par **accéléromètre**,
complémentaire de celle de `GTFRI` (qui, elle, est basée sur le GPS).

- `Mode = E` (bits 1+2+3) : signale les transitions arrêt/reprise **et** bascule
  les intervalles sur les valeurs de repos.
- `Non-movement Duration = 10` (×14 s ≈ **2 min 20**) : une pause photo ou un
  ravitaillement ne fait pas basculer en « arrêt ». Le défaut (28 s) est bien trop
  nerveux pour un coureur.
- `Fix/Send Interval at Rest = 300` s : au bivouac, un point toutes les 5 min au
  lieu de toutes les 30 s.

> **Effet combiné à connaître** : à l'arrêt prolongé, `GTNMD` ralentit à 5 min
> **et** la détection de `GTFRI` finit par couper les rapports. Après ~25 min
> d'immobilité, le tracker se tait jusqu'au prochain mouvement. C'est voulu
> (batterie), mais au-delà de 60 min la page `/live` affichera « zone blanche » —
> ce qui, une nuit au bivouac, est sémantiquement correct. Pour l'éviter, mettre
> le champ 15 de `GTFRI` à `0` et ne garder que `GTNMD`.

---

### 3.6 Les boutons — ce qu'ils font, et comment les régler

Le GL320MG a **deux boutons** : la **touche marche/arrêt** (power key) et la
**touche de fonction** (function key). Le comportement des deux se configure par
`AT+GTFKS`.

| Réglage | Valeur posée | Ce que ça donne |
| --- | --- | --- |
| Power Key Mode | `1` (défaut) | appui long = extinction |
| Full Power On | `1` | branché sur le chargeur, l'appareil démarre **complètement** (il ne fait pas que charger) |
| **Function Key Mode** | **`5`** — mode mixte | **deux actions sur un seul bouton**, selon la durée d'appui |
| First Trigger | **`2` s → événement `4`** | **appui 2 s = envoie ta position immédiatement** (`+RESP:GTLOC`). Parfait pour marquer un point ou tester la chaîne à la demande. |
| Second Trigger | **`8` s → événement `3`** | **appui 8 s = SOS**. Le défaut usine (3 s / 4 s) est bien trop serré : une seconde d'écart entre « position » et « SOS ». |
| **Vibration** (champs 5-6) | **`1` / `1`** | **désactivée d'usine.** L'appareil vibre pour confirmer l'appui — indispensable avec des gants, ou sac fermé. |
| SOS Report Mode | `3` | envoie la dernière position connue **tout de suite**, puis tente un fix frais et renvoie. Le bon compromis en urgence. |

> **Option à considérer pour l'aventure** : `Power Key Mode = 0` empêche
> l'extinction par le bouton — utile contre un appui accidentel au fond du sac.
> **Mais** l'extinction ne serait alors plus possible qu'à distance, et la
> commande correspondante n'est pas dans l'extrait de PDF dont on dispose : ne
> pose ce réglage qu'après avoir vérifié comment revenir en arrière.

---

### 3.7 Surveiller la batterie

**Il n'y a rien à demander au tracker** : `Info Report` (champs 14-15 de `GTCFG`,
posés ci-dessus) lui fait publier un `+RESP:GTINF` toutes les 5 min, qui porte
l'état de charge, la puissance du signal, l'ICCID et l'heure du dernier fix.
Traccar range ça dans les **attributs** de la position.

**En une commande, depuis n'importe où :**

```bash
curl -s https://tracking.thelocomotionlab.com/api/public/positions \
  | jq '.[] | select(.deviceId==92) | {fixTime, attributes}'
```

(Sans paramètres, `/positions` renvoie la **dernière position connue** de chaque
appareil — donc l'état courant.)

**Ou automatiquement**, dans le diagnostic : `check-tracker.sh` affiche
`🔋 batterie rapportée : N` à l'étape 3. S'il ne trouve rien, c'est que le rapport
d'état est désactivé — reposer `GTCFG`.

**L'alerte automatique** est déjà armée : `Battery Low Percentage = 20` +
`Event Mask = 0FFF` (bit 5) font émettre un `+RESP:GTBPL` dès que la charge passe
sous 20 %.

> ⚠️ Aucun de ces chiffres ne remplace la **mesure d'autonomie réelle** en sortie
> (§6). Avec un intervalle de 30 s, c'est ton premier poste de consommation.

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
| **JAMAIS connecté** | le tracker n'a **jamais** joint Traccar : IMEI, APN/SIM, ou serveur/port mal réglés |
| **dernier contact** daté (même ancien) | il a déjà parlé → **la config du tracker est bonne** ; c'est du réseau ou de la batterie |
| appareil introuvable | l'IMEI saisi dans Traccar ne correspond pas, ou l'appareil n'est pas partagé au compte `public` |

> Le tri se fait sur **`lastUpdate`, pas sur le libellé de statut** : selon la
> version, Traccar affiche « Hors ligne » (et non « Inconnu ») pour un appareil qui
> n'a jamais émis une seule fois. Les deux cas envoient pourtant chercher à des
> endroits opposés — réglages du tracker d'un côté, réseau/batterie de l'autre.

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
| Traccar a des positions, `./track status` affiche **0 point** | la fenêtre a été ouverte **après** le dernier fix : `track start` ne collecte qu'à partir de son instant d'ouverture, jamais rétroactivement | obtenir des positions **fraîches**, puis `./track reset && ./track start` |
| Des positions arrivent mais **rien sur la carte** | le tracker émet **sans fix GPS** : Traccar stocke des points invalides ou à (0,0) | le sortir dehors, ciel dégagé, 15 min immobile. Le script compte les fix réellement valides (§4) |
| Data consommée surtout à l'**extinction** du tracker | pas d'intervalle de report fixe actif : l'appareil ne parle que sur événement, et vide son buffer à l'arrêt | faire accepter `GTFRI` (§3.2) |
| Trace qui **gigote sur place** alors que le tracker ne bouge pas (distance et D+ qui montent à l'arrêt) | dérive GPS statique : chaque fix tombe à quelques mètres du précédent | détection de mouvement de `GTFRI` (champs 15-18) + `GTNMD` — cf. §3.5 |
| Lacets coupés en ligne droite sur la carte | rapport purement temporel : entre deux points de 30 s, le virage n'existe pas | `Corner` (champ 19 de `GTFRI`) à `45`, voire `30` — §3.5 |
| Pas de batterie affichée | rapport d'état désactivé | `GTCFG` champs 14-15 — §3.7 |
| Trous dans la trace qui ne se remplissent jamais | buffer désactivé, ou coupure plus longue que le lookback | §3.4 : buffer ON + `BUFFER_LOOKBACK_MINUTES` |
| Ça marchait, plus rien depuis une heure | zone blanche (≠ panne) | attendre ; `./track status` ; puis §4 |
| Batterie vide bien avant l'heure annoncée | intervalle trop rapide, froid, recherche réseau permanente | allonger l'intervalle (60 s), batterie externe pour l'ultra |
| Connexion impossible depuis le tracker seulement | DNS `tracking` passé en nuage **orange** | le repasser en **DNS-only (gris)** — §2.3 |

---

## 8. État de la mise en service

**Chaîne matérielle bouclée le 4 août 2026, 22 h 06.** Les deux commandes de
configuration ont été acquittées et les positions ont suivi immédiatement :

```
+ACK:GTSRI,C30303,860201069202698,,FFFF,20260804200548,00B2$
+ACK:GTFRI,C30303,860201069202698,,FFFF,20260804200617,00B4$
→ positions valid:true à 20:06:55 puis 20:07:17 (≈ 30 s d'écart, conforme)
```

Ce qui était supposé au premier jet et qui est **désormais vérifié** :

- **Mot de passe d'usine `gl320m`** — confirmé par les ACK.
- **Ordre des champs de `GTSRI` (16) et `GTFRI` (21)** — lu dans le PDF officiel
  `QSZTRACGL320MAN0303`, recompté, et validé sur l'appareil.
- **Le SMS est le bon canal** ; `/dev/ttyUSB2` est le port AT du modem cellulaire,
  qui ignore les commandes `AT+GT*`.

**Ce qui reste ouvert :**

1. **Le détail des LED** et la durée d'appui exacte du bouton (§3.1) — cosmétique,
   se lit dans le *user manual*.
2. **Le repli 2G** : le champ 5 de `GTBSI` (GPRS APN) est vide. À remplir avec
   `simbase` si le repli doit vraiment fonctionner (§« Ce qui est confirmé »).
3. **L'autonomie réelle à 30 s d'intervalle**, GPS jamais éteint — la seule mesure
   qui compte avant une sortie de plusieurs jours (§6).
4. **`Multi-packet Sending`** (champ 13 de `GTSRI`) non testé contre le décodeur
   `gl200` de Traccar — laissé à `0`.
