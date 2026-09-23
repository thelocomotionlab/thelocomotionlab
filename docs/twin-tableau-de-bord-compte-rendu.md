# Chantier « Tableau de bord » — compte-rendu

> Document de chantier, destiné à `docs/archive/` à la clôture. Il n'édicte aucune règle :
> le contrat est dans [`twin-tableau-de-bord-api.md`](./twin-tableau-de-bord-api.md), la
> composition dans `docs/design/twin-tableau-de-bord/`, l'usage dans
> [`manuel-twin.md`](./manuel-twin.md).
>
> Ce qu'il consigne : ce que Claude a choisi à la place de Valentin, ce qui a divergé entre
> les documents et le code, et ce qui reste à vérifier sur la vraie machine.

## Phase 1 — le socle (branche `twin/tableau-de-bord-phase1`)

Le socle de stockage et la file · les deux serrures, le routage Caddy et la File ·
le dépôt qui prévient le moteur, l'ingestion, l'import d'un plan du CLI · les écrans
File et Athlète.

**Vert à la fin de la phase** : `pytest services/twin-engine` 547 passés / 15 sautés,
golden déterministe intact ; `pnpm -F twin-depot build` et `test` 34 passés ;
`pnpm -F site build lint test` 496 passés ; `packages/ui` tsc et 16 tests.

## Phases 2 à 4 — courses, plans, page de l'athlète, registre (branche `claude/compassionate-mccarthy-bespjj`)

La bibliothèque et l'éditeur de course (Trace, Ravitaillements, Horloge et terrain) · la
génération depuis le jumeau gardé, les versions, « Publier », « Envoyer », le PDF unique ·
la page de l'athlète `/services/twin/plan/[ref]` et ses amendements · le registre vivant.

**Vert à la fin** : `pytest services/twin-engine` 695 passés / 2 sautés (XeLaTeX présent),
golden tableau de bord contre CLI tenu à l'octet ; `pnpm -F site lint test build` 556 passés ;
`pnpm -F site build:cf` construit, `/services/twin/plan/[ref]` en route edge ;
`packages/ui` tsc et 16 tests ; `apps/studio` tsc.

### Ce qui a divergé

- **Les phases** (question ouverte de la Phase 1) : une phase commence **sur un
  ravitaillement** — l'éditeur aimante le glisser au plus proche — et court jusqu'à la
  suivante ou à l'arrivée ; `au_km` se déduit. La traduction vers `RaceSpec.Phase` est donc
  sans perte, et une phase hors ravitaillement est refusée à l'enregistrement (422), pas à la
  génération.
- **`version_publiee`**, absent du §3.3 : sans lui, générer une v2 pour essayer un réglage la
  montrerait aussitôt à l'athlète. La page sert la version publiée, le tableau de bord la
  courante.
- **`depart_le` sur le Plan** : un plan importé du CLI n'a pas toujours de course en
  bibliothèque, et sans départ il ne saurait jamais qu'il est figé.
- **La base et les amendements** : `version.json` garde la composition de Valentin à part
  des amendements de l'athlète. Ils se rejouent sur la version suivante quand elle est
  publiée, et l'athlète peut en retirer un sans effacer ce que Valentin a posé.
- **Des routes que le contrat ne nomme pas** : `GET /courses/{id}/trace` (rouvrir l'éditeur
  relit la trace avec les ravitaillements du jour), `GET /tableau-de-bord/jobs/{id}` et
  `GET /plans/{ref}/jobs/{id}?k=…` (un job se suit sous la serrure de celui qui l'a lancé).
  `/twin/jobs/*` ne sort plus par Caddy.
- **`niveau` hors du lien de partage** : il se lit dans le verdict, que le §5.8 réserve à la
  clé privée.
- **La maquette comptait « 16 posés » pour Nice**, dont la liste porte 17 points : le départ
  ne se compte pas. L'éditeur et la bibliothèque disent maintenant le même nombre.

### Ce que Claude a choisi à la place de Valentin

| Choix | Pourquoi |
|---|---|
| La page de l'athlète en runtime **edge** | C'est la seule route dynamique du site : la référence arrive après le build. `next-on-pages` l'exige en edge ; ses en-têtes (`noindex`, `no-referrer`, `no-store`) viennent donc de `next.config.mjs`, `public/_headers` ne s'appliquant qu'aux fichiers statiques. |
| Le QR du rapport porte la **clé privée** | Sans clé, le QR menait à une page qui répond 404. Le CLI la dérive de `TWIN_KEYS_SECRET` et prévient quand il ne l'a pas. |
| Un seul PDF (rapport, feuille, fiches) assemblé par `pypdf` | Un fichier à joindre, un seul à imprimer ; la feuille seule reste téléchargeable. |
| `course.sh publier` ne fait plus qu'importer | Le dossier, les documents et l'annexe entrent dans le tableau de bord ; « Publier » se fait depuis l'écran Plan, comme pour un plan généré. |
| Des primitives de formulaire dans `packages/ui` (`BoutonTexte`, `Segments`, `ChampCompact`, `Case`, `Choix`, `Etapes`) | La charte vient de `packages/ui` et de nulle part ailleurs ; le test de charte refuse maintenant les `<button>` et `<input>` bruts dans les écrans du tableau de bord (sauf le champ fichier, la coquille et le profil). |
| La politique d'arrêts du moteur dite en chiffres par le moteur (`politique_standard`) | L'écran Plan ne recopie aucune constante de la config. |
| L'annexe garde le profil allégé (600 points) et « où passe le temps » en clair | La page met en page, elle ne recalcule rien. |

### Trouvé en chemin, et corrigé

- **Les bases majeures tombaient un ravitaillement trop tôt** : Collelongue, Rimplas et
  Utelle au lieu d'Isola, Venanson et Levens. `RaceSpec` compte `major_base_indices` en
  **segments** (le segment k finit au ravitaillement k+1), là où `crew`, `reglages` et
  `phases` comptent en ravitaillements ; la traduction confondait les deux. L'erreur étant
  symétrique, l'aller-retour revenait intact et les tests passaient. Un test fixe maintenant
  le sens par les noms.
- **Le dossier n'était pas identique à l'octet** entre deux fabrications : l'en-tête gzip
  de la trace portait l'heure. `mtime=0`, et le golden tient.
- **La File et la fiche perdaient un plan** dont l'athlète n'avait pas le reflet dans sa
  liste `plans` : l'athlète repassait « à composer » avec un plan publié. C'est désormais
  l'`athlete_id` du plan qui fait foi ; la liste n'est plus qu'un reflet.
- **Supprimer un athlète laissait ses demandes** (et leurs notes) sur le volume, et effaçait
  ses entrées de registre alors que le contrat dit qu'elles restent. Les demandes partent ;
  les entrées des courses courues sont gardées sous `/data/registre/`, sous pseudonyme — de
  même quand on supprime un plan couru. La suppression attend qu'aucun job ne tourne.
- **Du LaTeX sur la page de l'athlète** : « 3\texttimes plus de temps »,
  « \textasciitilde 9,9 km/h ». `detex` connaît maintenant `\texttimes`,
  `\textasciitilde`, `\textasciicircum`, `\LLfleche` et `\ieme`, et un test balaie toute
  l'annexe.
- **Une minute d'écart entre la page et le PDF** : l'annexe arrondissait les heures à deux
  décimales (36 s). Elle en garde quatre.
- **Un identifiant pouvait sortir du volume** (`supprimer("..")`) : les collections refusent
  maintenant tout id qui compose un chemin.

## À vérifier sur la vraie machine (Phases 2 à 4)

- **L'envoi** : le moteur lit `SMTP_*` dans `infra/.env`, comme `atelier-api`. Un plan
  envoyé à soi-même le prouve ; sans relais, « Envoyer » répond 502 et rien n'est marqué
  envoyé.
- **Access ne couvre pas la page de l'athlète** : `/services/twin/plan/…` doit s'ouvrir dans
  une fenêtre privée sans rien demander.
- **`docker stats` pendant une génération** : XeLaTeX puis l'assemblage du PDF, sous la même
  borne de 3 Go que l'ingestion.
- **L'ordre du déploiement** : le moteur (image) et Caddy (`api.caddy` a changé) **avant** le
  site — la page de l'athlète et les nouveaux écrans appellent des routes que l'ancien moteur
  n'a pas.

---

## Ce qui a divergé

### Le récapitulatif annonçait la suppression de `POST /fiche`

Son §2 range « `POST /fiche` — feuille seule » dans les routes intégrées à la génération.
Ce n'est pas la feuille du rapport : c'est la **fiche participant·e des ateliers**, appelée
par `atelier-api` sur le réseau Docker (`services/atelier-api/src/fiche.ts`). La supprimer
casserait la page Pratiquer. La feuille seule du rapport, elle, c'est `POST /rendu` avec
`feuille_seule: true`. **`/fiche` est conservée.**

### `chaleur_pct` (§3.2) contre `heat_c` (`RaceSpec`)

Le récapitulatif donne un pourcentage, le moteur attend des **degrés Celsius**, et son
format ne bouge pas (§0). Un pourcentage ne se convertit pas en °C. Le champ de la Course
porte donc l'unité qu'il transporte : **`chaleur_c`**. `technicite_pct` ↔ `technicity_pct`
tombe juste et ne change pas.

### `phases` (§3.2) contre `Phase` (`RaceSpec`) — à trancher en Phase 2

Le récapitulatif borne une phase en kilomètres (`du_km`, `au_km`) ; `RaceSpec.Phase` la
borne à un **index de ravitaillement** et porte en plus une `note`. Le §3.2 promet une
traduction « sans perte » : elle ne l'est pas. Soit une phase ne peut commencer qu'à un
ravitaillement, soit la traduction arrondit au plus proche et devient approximative.
**Question ouverte, à poser avant l'éditeur de course.**

### La maquette annonce une durée

L'état vide de la fiche athlète écrit « les quatre chiffres et le niveau se calculent en
**quelques minutes** ». Les §1 du chantier et §8.6 du récapitulatif l'interdisent. C'est
une règle, pas une composition : le récapitulatif l'emporte. L'écran montre l'état en cours
et l'`avancement` que le job renvoie. Un test le tient
(`apps/site/lib/charteTableauDeBord.test.js`).

### Le test de charte n'existait pas

Le §2.7 dit « le test du site qui l'interdit s'étend à ces pages ». Il n'y avait aucun test
interdisant les valeurs en dur. Il a été **écrit**, et scopé au tableau de bord : le reste du
site porte des valeurs calculées (cartes, planches, SVG) qui passent par le miroir JS des
tokens, et qu'une garde à la lettre condamnerait à tort. Étendre au site entier est un
chantier à part.

---

## Ce que Claude a choisi à la place de Valentin

| Choix | Pourquoi |
|---|---|
| `jobs.sqlite` retiré, jobs en JSON sous `jobs/{id}/job.json` | « Aucune base de données » (§3.5). Garder SQLite pour les jobs et JSON pour le reste, c'est deux mécanismes qui divergeront. L'arborescence du §2.2 ne mentionne pas `jobs/` ; il y est ajouté. |
| `depot_id` sur l'Athlète | Absent du §3.1, mais sans lui le moteur ne sait pas quelle archive télécharger. La planche Athlète montre bien une ligne « Dépôt ». |
| Identité d'un athlète = SHA-256 de son email, tronqué | §3.1 : c'est l'email qui le reconnaît à sa deuxième course. Haché, parce qu'un id voyage dans des URL et des journaux. Un dépôt rejoué ne crée donc jamais de doublon. |
| Le niveau est posé **sans prédiction** | Jumeau, calibration et niveau sont des propriétés de l'athlète, pas d'une course. Conséquence : le critère « domaine de calibration » n'entre pas dans le niveau de la fiche — il compare un parcours au domaine du moteur, et appartient au plan. Un même athlète peut être calibré pour un 100 miles et hors domaine sur un six heures. |
| 🟢 et 🟠 → `calibre`, 🔴 → `base` | Choix de Valentin, posé en session. L'orange porte des réserves, pas une incapacité ; elles s'affichent à côté. |
| `POST /tableau-de-bord/file/refresh` | Le §5.1 décrit le bouton « rafraîchir » sans nommer sa route. Le verbe suit le style des autres (`/ingest`, `/publish`). |
| L'id de l'athlète en query, pas en chemin | Une route dynamique demanderait au build d'énumérer les athlètes, qui arrivent après lui et sont privés. |
| `Tableau` et `BadgeEtat` élargis dans `packages/ui` | La maquette demande des badges, des boutons et des champs en cellule, et sept statuts là où `BadgeEtat` n'acceptait que les trois états d'une campagne. Proposer autrement plutôt que contourner (CLAUDE.md § Liberté). Le site public ne change pas. |
| Une allowlist d'origines unique (`api.origins`) | Ni le brief ni le récapitulatif ne parlent de CORS, et sans lui **rien ne marche** : les pages et l'API sont sur deux domaines, et l'en-tête `Authorization` force un préflight même sur un GET. |
| `CF-Connecting-IP` puis `X-Forwarded-For` | Même ordre qu'`atelier-api`. Derrière le proxy, `request.client.host` est le proxy : la limite « par IP » du §4.2 serait globale, et le premier venu fermerait la porte à tout le monde. |

## Trouvé en chemin, et corrigé

- **Un verdict 🔴 sortait en « échec du traitement ».** `FullResult.to_dict()` appelait
  `self.plan.to_dict()` sur un plan absent : une archive trop maigre se lisait comme une
  panne du service. Elle rend maintenant un résultat qui dit pourquoi, et porte sa référence.
- **`GET /jobs/{id}` renvoyait les chemins absolus du conteneur** (PDF, figures, livrables)
  dans son `resultat`. C'est l'un des trois préfixes exposés : ils sortent de la vue publique.
- **Une archive illisible passait pour « ingérée ».** L'ingestion écarte les fichiers qu'elle
  ne sait pas lire sans jamais lever ; une archive entièrement écartée produisait donc un
  jumeau vide en toute tranquillité. Zéro activité lisible est maintenant `illisible`, avec un
  message qui dit quoi redemander.
- **Un préflight servi par une route `{chemin:path}` faisait répondre 405** à un GET sur un
  chemin inexistant — ce qui avoue que le préfixe existe, là où la règle demande 404. Il se
  sert dans le middleware, sans route.
- **Une heure de départ s'affichait dans le fuseau du navigateur.** 13h00 à Nice devenait
  11h00 sur un serveur en UTC, et minuit et demi à La Réunion changeait de jour.

## Retiré

Le dépôt `ssh` de `scripts/course.sh` (`TWIN_VPS`, `TWIN_ENGINE_CONTENEUR`, la commande
`docker exec` à distance) : une porte de plus à garder, sur un poste de travail, pour faire ce
que `POST /plans/import` fait mieux. `infra/caddy/conf.d/twin-engine.caddy.disabled` aussi :
le moteur n'aura pas de sous-domaine à lui.

## À vérifier sur la vraie machine

**Les bornes du conteneur `twin-engine` : 2 CPU, 3 Go** (réservation 512 Mo), sur un VPS de
4 vCores / 8 Go qui porte aussi Traccar (JVM, sur l'hôte et non conteneurisé), Caddy,
Listmonk, sa base Postgres et quatre services Node.

Deux cœurs pour qu'une passe d'archive n'étrangle pas le direct — le tracking et le journal
sont les seules choses du VPS qui ne peuvent pas attendre. Trois Go parce que le pic n'est pas
l'API mais le **job** : les activités d'une archive en mémoire, puis XeLaTeX. Une borne trop
basse tue le conteneur **au milieu d'un rendu**, ce qui est le pire moment. La file ne laisse
tourner qu'un job à la fois, donc ce pic est celui d'un seul passage.

**Ces chiffres sont un pari, pas une mesure.** `docker stats` pendant une ingestion et pendant
un rendu les confirmera ou non. Si la mémoire frôle les 3 Go, c'est le chiffre qui est faux,
pas l'archive.

**Le disque, 75 Go**, est la contrainte moins visible : `twin_depot_data` garde des archives de
plusieurs centaines de Mo jusqu'au rapatriement. C'est là que ça se remplira en premier.

## Reste à faire

- ~~Cloudflare Access~~ : posé par Valentin (Google, une adresse) ; ~~les trois secrets~~ :
  posés. ~~Le golden tableau de bord contre CLI~~ : écrit en Phase 3
  (`tests/test_generation.py`).
- **Retirer l'ancienne page d'annexe**, remplacée par la page de l'athlète — en attente de
  l'accord de Valentin, parce que c'est une suppression : `apps/site/app/services/twin/annexe/`,
  `apps/site/lib/twinAnnexes.mjs`, `apps/site/public/twin-annexes/`, et côté moteur la route
  `POST /rendu` avec ses bornes (`tests/test_api_rendu.py`).
- `@cloudflare/next-on-pages` est déprécié au profit d'OpenNext : la version de la CLI Vercel
  que fixe `build:cf` tient le build aujourd'hui, pas indéfiniment.
