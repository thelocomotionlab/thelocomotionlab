# twin-depot — dépôt d'archives de la cohorte Locomotion Twin

Service Node/TS (Fastify) qui reçoit les **archives d'entraînement** des
athlètes test de la page
[/outils/twin/cohorte](https://thelocomotionlab.com/outils/twin/cohorte) et
les pose sur le **volume du VPS** avec leurs métadonnées, en attendant leur
analyse (calibration du moteur Twin) puis leur **purge**. Conteneurisé
(Docker → GHCR → VPS), derrière Caddy sur `depot.thelocomotionlab.com/twin/*`
(cf. `infra/caddy/conf.d/depot.caddy`).

> ⚠ **Pourquoi un sous-domaine dédié, en DNS-only (nuage GRIS) ?** Le proxy
> Cloudflare (plan free) plafonne les corps de requête à ~100 Mo ; une archive
> Garmin/Strava en fait couramment plusieurs centaines. `depot.*` doit donc
> pointer **directement** sur le VPS (pas de nuage orange), sinon les gros
> dépôts meurent en 413 à la bordure Cloudflare. Le certificat reste émis par
> Caddy en DNS-01, comme les autres sous-domaines.

## Modèle

- **Constantes côté service** : `twin-depot.config.json` (versionné) —
  origines CORS, débit, `maxArchiveMo` (2 Go), `montres` acceptées. ⚠ Les ids
  de `montres` et `maxArchiveMo` restent en phase avec
  `apps/site/lib/twinCohorte.mjs`, et `maxArchiveMo` avec la borne
  `request_body` de `depot.caddy`.
- **Dépôts** : métadonnées dans `depots.json` (écriture atomique tmp+rename,
  chargé en mémoire) + l'archive dans `archives/<id>/<nomFichier>` sur le
  volume `twin_depot_data`. L'archive est **streamée** vers le volume (jamais
  en mémoire), SHA-256 calculé au fil de l'eau, rename atomique une fois le
  formulaire validé ; tout échec purge le temporaire, et les tmp orphelins
  d'un crash sont purgés au démarrage. Un dépôt =
  `{ id, reference (LL-TWIN-<année>-<seq>), prenom, nom, email, montre,
  objectifs, objectifCible, objectifHeures, consent, nomFichier, taille, sha256,
  createdAt, ip }`. **`objectifCible`/`objectifHeures`** portent l'objectif CHIFFRÉ
  (facultatif, « 31h », « 31h30 », « 31:00:00 » ou un nombre — illisible → **400**
  `objectif_invalide`) : c'est ce que consomme le `--target` du moteur (mode objectif,
  [ADR 0002](../../docs/adr/0002-mode-objectif-plan-sur-cible.md)). Le texte libre
  `objectifs` reste à côté : il porte le récit, l'autre porte le nombre.

## Endpoints

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/twin/healthz` | Vivacité (compose healthcheck) + état des emails (notification, confirmation). |
| POST | `/twin/depots` | Dépôt multipart `{ prenom*, nom, email*, montre*, objectifs, objectifCible, consent*="oui", website (honeypot), archive* (fichier) }` → `{ ok, reference }`. Trop gros → **413**, formulaire incomplet → **400** `{ error }`, débit → **429**. CORS restreint aux origines du site. |
| GET | `/twin/depots` | **Admin** (`Authorization: Bearer $TWIN_DEPOT_ADMIN_TOKEN`) : listing des dépôts (métadonnées). |
| GET | `/twin/depots/:id/archive` | **Admin** : téléchargement de l'archive (stream). |
| DELETE | `/twin/depots/:id` | **Admin** : purge du dépôt analysé (archive + métadonnées). |

Garde-fous (pattern `atelier-api`/`email-gateway`) : honeypot `website`
(robot → faux succès, rien d'écrit), limite de débit par IP en mémoire
(basse : les uploads sont lourds), montre validée contre la config, nom de
fichier nettoyé (pas de traversée de chemin).

## Rapatrier les dépôts en local (et dépouiller le VPS)

Le geste du quotidien — tout en un : lister, télécharger, **vérifier le
SHA-256** (celui calculé par le service au dépôt), écrire les métadonnées
dans `<référence>/depot.json`, puis **purger le VPS** (uniquement après
vérification). Depuis ton poste :

```bash
TWIN_DEPOT_ADMIN_TOKEN=<jeton> services/twin-depot/scripts/rapatrier-depots.py
# destination par défaut : ~/LocomotionLab/depots-twin (sinon : … rapatrier-depots.py /chemin)
```

Python 3 standard, aucune dépendance. En cas d'échec (réseau, SHA différent),
rien n'est purgé — relancer suffit. Les archives ne vivent alors QUE sur ton
poste : à supprimer là-bas aussi après analyse (règle du labo).

À chaque dépôt, **deux emails** partent (même relais SMTP Brevo que le reste,
variables `SMTP_*` d'`infra/.env`) — chacun **best-effort** : un échec
n'annule jamais le dépôt (logs pour rattrapage via le listing admin) :
1. la **notification** vers `TWIN_DEPOT_NOTIFY_EMAIL` (métadonnées + rappel
   de la procédure admin) ;
2. la **confirmation au déposant** (adresse du formulaire) : archive bien
   reçue, référence `LL-TWIN-…`, rappel de la suppression après analyse —
   c'est la trace écrite de la promesse de l'écran de succès du site.

## Données personnelles

Une archive d'entraînement est une donnée personnelle **volumineuse et
sensible** (positions GPS, fréquence cardiaque). Cycle de vie :

- **déposée chiffrée** : le flux de l'upload traverse un chiffrement AES-256-GCM
  (`src/chiffre.ts`) avant d'atteindre le volume ; la clé (`TWIN_DEPOT_ARCHIVE_KEY`) ne
  vit que dans l'environnement. Sans clé, le service refuse les dépôts (503). Les
  archives d'avant le chiffrement sont chiffrées au premier démarrage avec la clé ;
- **lue par le moteur** : la route admin de téléchargement déchiffre au fil de l'eau ;
  le moteur vérifie le SHA-256 du clair, ingère dans un répertoire temporaire et le
  supprime aussitôt — le volume du dépôt est le seul endroit où l'archive vit ;
- **purgée par le moteur** (`DELETE` admin) à l'échéance de conservation que porte
  l'athlète au tableau de bord (`cohorte.conservation_jours` du moteur, 183 jours par
  défaut, pour un consentement à la conservation ; aussitôt ingérée pour un
  consentement d'avant, qui promettait la suppression après analyse).

Le dépôt garde la version du texte de consentement accepté
(`consentementVersion`, une des `consentementVersions` de la configuration ; un
formulaire qui n'en envoie pas vaut la première). Pas de sauvegarde du volume —
une sauvegarde serait un second endroit — mais **surveiller l'espace disque**.

`scripts/rapatrier-depots.py` télécharge une copie EN CLAIR de chaque archive puis
purge le VPS : il date d'avant la conservation, et une copie rapatriée est un second
endroit hors du chiffrement et de la purge.

## Analyse d'un dépôt (côté Valentin)

```bash
TOKEN=...   # TWIN_DEPOT_ADMIN_TOKEN d'infra/.env
BASE=https://depot.thelocomotionlab.com/twin
curl -s -H "Authorization: Bearer $TOKEN" $BASE/depots | jq
curl -H "Authorization: Bearer $TOKEN" -OJ $BASE/depots/<id>/archive
# … analyse (DIAGNOSTIC §8 / golden réel), puis purge :
curl -X DELETE -H "Authorization: Bearer $TOKEN" $BASE/depots/<id>
```

## Dev local

```bash
pnpm --filter @locomotionlab/twin-depot test    # vitest
pnpm --filter @locomotionlab/twin-depot dev     # build + run sur :3000
curl -s localhost:3000/twin/healthz | jq
```

Côté site : `NEXT_PUBLIC_TWIN_DEPOT_API=http://localhost:3000/twin pnpm -F site dev`.

## Déploiement

1. CI : `.github/workflows/deploy-vps.yml` construit et pousse
   `ghcr.io/thelocomotionlab/twin-depot` à chaque push sur `main`.
2. DNS : créer `depot.thelocomotionlab.com` → IP du VPS, **DNS only (nuage
   gris)** — cf. l'avertissement ci-dessus.
3. VPS : renseigner `TWIN_DEPOT_ADMIN_TOKEN` (`openssl rand -hex 24`) et
   `TWIN_DEPOT_NOTIFY_EMAIL` dans `infra/.env`, puis `cd infra && ./deploy.sh`.
4. Site : poser `NEXT_PUBLIC_TWIN_DEPOT_API=https://depot.thelocomotionlab.com/twin`
   dans l'environnement de build Cloudflare Pages et rebuilder — sans cette
   variable, la page s'affiche mais l'envoi renvoie vers /contact (aucune casse).
