# Secrets — Locomotion Lab

> **Principe** : aucun secret n'est versionné. Le code ne contient que des **références** à des
> variables d'environnement / secrets, jamais leur valeur. Les `.env*` sont git-ignorés (seul
> `.env.example`, sans valeurs, peut être committé).

## Liste des secrets attendus

| Variable | Utilisé par / où | Description | Où la définir |
| --- | --- | --- | --- |
| `TRACCAR_API_TOKEN` | Reverse-proxy **nginx** du VPS (`tracking.thelocomotionlab.com`, location `/api/public/`) | Bearer token de l'API Traccar, injecté dans l'en-tête `Authorization` pour exposer l'API publique sans login. Référencé dans `apps/site/notes_pratiques.txt`. | Secret du **VPS** (variable d'env du service / fichier hors-repo), injecté dans la conf nginx au déploiement (p. ex. `envsubst`). Le template de conf vivra sous `infra/`. |

### Pas de secret côté app web

- Le front (`apps/site`) appelle l'API publique via l'URL `https://tracking.thelocomotionlab.com`
  (cf. `components/LiveTracking.jsx`) — **aucun token côté client**.
- **EmailJS** (`emailjs-com`) : aucune clé n'est hardcodée dans le code. Si un envoi direct est
  réactivé, exposer les identifiants via `NEXT_PUBLIC_EMAILJS_*` (publics par nature) ou, mieux,
  passer par une route serveur.
- **Cloudflare / wrangler** (déploiement) : authentification interactive `wrangler login`
  (OAuth) — pas de token dans le repo. En CI, utiliser `CLOUDFLARE_API_TOKEN` (secret du runner).
- **Stripe** (futur, Locomotion Twin) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — à ajouter ici
  le moment venu, côté serveur uniquement.

---

## ⚠️ Fuite historique à traiter — `TRACCAR_API_TOKEN`

Un **vrai token Traccar** a été committé puis remplacé par un placeholder. Il vit **toujours dans
l'historique git** et a été **poussé sur `origin`** :

- Introduit dans le commit **`eb4f94e`** (`notes_pratiques.txt`).
- Assaini (→ `TON_TOKEN`) dans **`7d56063`**, puis ce travail le remplace par `${TRACCAR_API_TOKEN}`.
- L'expiry encodé dans le token est daté du **2025-10-27** (probablement déjà expiré), mais un secret
  poussé sur un remote doit être considéré **compromis** quoi qu'il arrive.

### Action n°1 (immédiate, indépendante de git) : **révoquer / régénérer le token**

Dans l'interface Traccar (compte de service de l'API publique) : invalider le token actuel et en
générer un nouveau, puis le déposer comme **secret du VPS** (jamais dans le repo). La purge d'historique
ci-dessous **n'annule pas** la fuite ; seule la rotation protège réellement.

### Action n°2 (optionnelle, DESTRUCTIVE) : purger l'historique

> ⚠️ Réécrit **tout** l'historique (nouveaux SHAs), impose un **force-push** et un **re-clone** par
> tous les collaborateurs / toutes les branches & forks. **À ne lancer qu'après validation.**
> Cette procédure est **documentée ici mais n'a pas été exécutée.**

Avec [`git filter-repo`](https://github.com/newren/git-filter-repo) (recommandé) :

```bash
# 0. Révoquer d'abord le token (Action n°1). Prévenir les collaborateurs.

# 1. Cloner à neuf (filter-repo exige un clone propre)
git clone --mirror git@github.com:thelocomotionlab/thelocomotionlab-website.git repo-purge
cd repo-purge

# 2. Mettre la valeur RÉELLE du token dans un fichier LOCAL (hors repo) :
#    replacements.txt  ->  une ligne :
#    <valeur_du_token_traccar>==>TRACCAR_API_TOKEN_REDACTED
#    (récupérer la valeur depuis `git show eb4f94e:notes_pratiques.txt`)

# 3. Réécrire tous les commits
git filter-repo --replace-text replacements.txt

# 4. Re-pousser de force (filter-repo a retiré le remote ; le re-déclarer)
git remote add origin git@github.com:thelocomotionlab/thelocomotionlab-website.git
git push --force --all origin
git push --force --tags origin
```

Variante : **BFG Repo-Cleaner** (`bfg --replace-text replacements.txt`), plus simple mais moins fin.

### Après la purge

- Tous les clones existants doivent être **re-clonés** (les anciens gardent le token).
- GitHub peut conserver l'ancien commit accessible par son SHA un certain temps (caches, forks,
  vues) → la **rotation** (Action n°1) reste la vraie protection.
- Toute PR / branche ouverte devra être rebattue sur l'historique réécrit.
