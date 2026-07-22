# Runbook ateliers — gérer les inscriptions à la main

> **Les gestes du quotidien de l'organisateur** : lister les inscrits, ajouter ou
> retirer quelqu'un, purger après l'atelier. Tout passe par l'API `atelier-api`
> (derrière `api.thelocomotionlab.com`) avec le jeton admin — aucune manipulation
> de fichier sur le VPS. Détail des routes : `services/atelier-api/README.md`.
> Ajouter/modifier les ATELIERS eux-mêmes (dates, capacité) : voir §6.

## 0. Préparer le jeton (une fois par session de travail)

Les commandes marchent depuis n'importe où (ton poste ou le VPS). Mets le jeton
dans une variable de shell pour ne pas le retaper :

```bash
# depuis le VPS (le lit directement dans .env) :
TOKEN=$(grep '^ATELIER_ADMIN_TOKEN=' /opt/locomotionlab/infra/.env | cut -d= -f2)
# ou depuis ton poste : TOKEN=<colle-le>
API=https://api.thelocomotionlab.com
```

Rappel : les réponses sont du JSON compact — ajoute ` | jq` à la fin d'une
commande si `jq` est installé, pour une sortie lisible.

## 1. Lister les inscrit·es d'un atelier

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API/ateliers/inscriptions?atelier=<id-atelier>"
```

Chaque entrée montre `id` (sert au désistement, §3), `prenom`, `email`,
`waitlist` (`false` = place confirmée, `true` = liste d'attente), `reference`
(`LL-ATL-…`) et la `fiche` complète (contacts d'urgence, consentements — c'est
le listing à imprimer/relire pour préparer l'atelier). Sans `?atelier=…`, tout
est listé. Le décompte public reste visible sans jeton :
`curl -s $API/ateliers/places`.

## 2. Ajouter quelqu'un

**Voie normale (à privilégier)** : envoie-lui le lien du formulaire —
`<site>/pratiquer/inscription/<slug>` — il/elle reçoit l'email + la fiche PDF,
tout est en règle.

**À sa place** (inscription par téléphone, personne peu à l'aise en ligne) :
remplis toi-même le formulaire du site avec ses informations, **avec son accord
explicite** — la fiche porte ses données de santé et ses consentements
(assurance, droit à l'image) : ne coche jamais pour quelqu'un qui n'a pas
répondu. L'email de confirmation et le PDF partent à SON adresse.

**En liste d'attente à la main** (juste prénom + email, aucun consentement
requis) :

```bash
curl -s -X POST "$API/ateliers/inscriptions" -H "Content-Type: application/json" \
  -d '{"atelierId":"<id-atelier>","prenom":"Prénom","email":"adresse@mail.fr","waitlist":true,"website":""}'
```

**Bloquer des places sans fiche** (invités, accompagnants) : baisse `capacity`
dans la config (§6) — les places « réservées » n'apparaissent jamais comme
disponibles.

## 3. Retirer quelqu'un (désistement)

1. Récupère son `id` dans le listing (§1) — repère la ligne par l'email.
2. Supprime **cette seule inscription** :
   ```bash
   curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$API/ateliers/inscriptions/<id>"
   ```
   Réponse : `{ ok, supprimee: "LL-ATL-…", atelierId, places: { … } }` — le champ
   `places` confirme la place libérée ; les compteurs du site suivent au
   prochain chargement de la page. La référence de dossier n'est jamais
   réutilisée.
3. **La liste d'attente n'est PAS prévenue automatiquement** (choix assumé,
   pas encore d'email automatique) : regarde dans le listing qui a
   `waitlist: true` (le plus ancien `createdAt` d'abord) et écris-lui
   toi-même avec le lien du formulaire.

## 4. Après l'atelier : purge des données perso (règle du labo)

```bash
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$API/ateliers/inscriptions?atelier=<id-atelier>"
```

Supprime TOUTES les inscriptions (et fiches) de cet atelier — à faire une fois
l'atelier passé, après avoir exporté ce que tu veux garder (cf.
`services/atelier-api/README.md` § Données personnelles). Le compteur de
références, lui, survit.

## 5. Vérifier que tout va bien

```bash
curl -s $API/ateliers/healthz     # { ok, ateliers, inscriptions, pdf: "actif", email: "actif" }
```

`pdf: "desactive"` → `TWIN_ENGINE_URL` vide ou moteur éteint ;
`email: "non_configure"` → `SMTP_HOST`/`SMTP_FROM` absents d'`infra/.env`.
Un email qui n'arrive pas alors que le healthz dit « actif » = clé `SMTP_PASS`
refusée par Brevo à l'envoi → `docker compose logs atelier-api --tail 20`.

## 6. Ajouter / modifier un ATELIER (pas une inscription)

Les ateliers vivent dans **deux fichiers à garder en phase** (id identiques) :

- `services/atelier-api/atelier-api.config.json` — la **source du décompte**
  (capacity, status `open|full|past`) et des mentions du PDF (title, dateLabel,
  lieu) ;
- `apps/site/lib/ateliers.mjs` — le contenu affiché/SEO côté site (mêmes
  champs + slug, prix, photo).

Modification = commit → merge dans `main` → la CI reconstruit l'image → sur le
VPS `git pull && cd infra && ./deploy.sh` → et `pnpm -F site deploy:staging`
(ou `deploy:cf` après le lancement) pour la partie site. Fermer les
inscriptions d'un atelier sans le cacher : `status: "full"` ; le faire
disparaître des pages : `status: "past"`.
