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

## Historique : ancien token Traccar (clos)

Un ancien token Traccar de test a transité par l'historique git (`notes_pratiques.txt`), puis a été
remplacé dans le code par la référence `${TRACCAR_API_TOKEN}`.

**Décision (validée par le mainteneur) :** ce token a depuis été régénéré plusieurs fois et n'a plus
aucune valeur ; l'historique git n'est **volontairement pas purgé**. Aucune action requise. Le
working tree ne contient **aucun secret en clair**.

> Rappel d'hygiène pour la suite : un secret réellement sensible poussé sur un remote doit toujours
> être considéré comme **compromis**. La vraie protection est de le **régénérer côté fournisseur**
> (la rotation) ; réécrire l'historique ne suffit jamais et n'est pas nécessaire ici.
