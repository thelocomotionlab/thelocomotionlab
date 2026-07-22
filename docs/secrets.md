# Secrets — Locomotion Lab

> **Principe** : aucun secret n'est versionné. Le code ne contient que des **références** à des
> variables d'environnement / secrets, jamais leur valeur. Les `.env*` sont git-ignorés (seul
> `.env.example`, sans valeurs, peut être committé).

## Liste des secrets attendus

| Variable | Utilisé par / où | Description | Où la définir |
| --- | --- | --- | --- |
| `TRACCAR_API_TOKEN` | Reverse-proxy du VPS (`tracking.thelocomotionlab.com`, route `/api/public/`) — **nginx** aujourd'hui, **Caddy** à la bascule (`infra/caddy/conf.d/tracking.caddy`) | Bearer token de l'API Traccar, injecté dans l'en-tête `Authorization` pour exposer l'API publique sans login. Référencé dans `apps/site/notes_pratiques.txt`. | Secret du **VPS** : aujourd'hui dans la conf nginx (`envsubst`), demain dans **`infra/.env`** (non versionné) lu par Caddy via `{$TRACCAR_API_TOKEN}`. |
| `CF_API_TOKEN` | **Caddy** sur le VPS (`infra/`), pour l'**ACME DNS-01** Cloudflare (émission/renouvellement des certificats Let's Encrypt) | Token API Cloudflare **scopé** : `Zone:DNS:Edit` + `Zone:Zone:Read` sur la zone `thelocomotionlab.com`. **Jamais** la clé globale. | **`infra/.env`** (non versionné). Création du token : [`docs/cloudflare-vps.md`](./cloudflare-vps.md) §1. |
| `TELEGRAM_BOT_TOKEN` | `services/live-journal` (webhook du journal, envoi des messages privés, script `set-webhook.sh`) | Token du bot Telegram du journal de bord, créé via **BotFather**. Donne le contrôle TOTAL du bot : à régénérer chez BotFather (`/revoke`) au moindre doute. | **`infra/.env`** (non versionné). |
| `TELEGRAM_WEBHOOK_SECRET` | `services/live-journal` (vérification de l'en-tête `X-Telegram-Bot-Api-Secret-Token`) | Secret d'authentification du webhook — seule preuve que l'appel vient bien de Telegram. À inventer : `openssl rand -hex 32`. | **`infra/.env`** (non versionné), déclaré à Telegram par `services/live-journal/scripts/set-webhook.sh`. |
| `VALENTIN_CHAT_ID` | `services/live-journal` (filtre « seul Valentin alimente le journal » + destinataire des messages privés) | `chat_id` Telegram personnel de Valentin (le bot `@userinfobot` le donne). Pas un secret cryptographique, mais on le traite comme tel : il désigne la boîte de réception privée. | **`infra/.env`** (non versionné). |
| `ATELIER_ADMIN_TOKEN` | `services/atelier-api` (routes admin : listing + purge des inscriptions aux ateliers) | Bearer token des routes admin — donne accès aux prénoms/emails des inscrits. À inventer : `openssl rand -hex 24`. Vide → routes admin désactivées. | **`infra/.env`** (non versionné). |
| `SMTP_USER` / `SMTP_PASS` | `services/atelier-api` (email récapitulatif d'inscription avec la fiche PDF) | Identifiants SMTP du relais d'envoi (Brevo — la clé SMTP se génère dans Brevo → SMTP & API). À régénérer chez Brevo au moindre doute. `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` les accompagnent (non secrets). | **`infra/.env`** (non versionné). |

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
