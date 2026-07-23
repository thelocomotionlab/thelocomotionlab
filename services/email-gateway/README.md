# email-gateway — passerelle des formulaires email du site (Worker Cloudflare)

Deux rôles :
1. **Capture email** (`/subscribe`) : crée le contact dans **Listmonk**
   (auto-hébergé sur le VPS, cf. `infra/compose.yml`) avec son attribut
   `source`. Listmonk envoie ensuite l'email de confirmation
   (**double opt-in**) via le relais SMTP configuré dans son interface (Brevo).
2. **Relai du formulaire de contact** (`/contact`) : envoie le message à
   `CONTACT_TO` via l'**API transactionnelle Brevo** (un Worker ne parle pas
   SMTP), avec `Reply-To` = le visiteur — répondre depuis la boîte répond
   directement à la personne.

La mise en place complète (Listmonk, Brevo, DNS, bascule du site) est
décrite dans [`docs/email-setup.md`](../../docs/email-setup.md).

## API

`POST /subscribe` — corps JSON :

```json
{ "email": "personne@example.com", "source": "comprendre" }
```

- `source` ∈ `quete · comprendre · twin · live · home · pratiquer ·
  pratiquer-trail · soutenir` (+ `footer` et `manifeste`, valeurs
  historiques tolérées).
- Champ `website` = honeypot : doit rester vide (rempli par les robots →
  faux succès, rien n'est créé).
- Réponses : `200 {"ok":true}` (aussi si l'adresse était déjà inscrite —
  pas d'énumération), `400` (email/source invalides), `429` (débit),
  `502` (Listmonk injoignable).

`POST /contact` — corps JSON :

```json
{ "name": "Prénom Nom", "email": "personne@example.com", "message": "…" }
```

- Champ `website` = honeypot (même règle).
- Réponses : `200 {"ok":true}`, `400` (`nom_invalide` / `email_invalide` /
  `message_invalide` / `corps_invalide`), `429` (débit), `502` (Brevo
  injoignable ou relai non configuré).

CORS restreint aux origines du site (+ staging + `http://localhost:3000`).

## Configuration

Variables non secrètes dans `wrangler.toml` : `LISTMONK_URL`,
`LISTMONK_LIST_ID` (à ajuster après création de la liste dans Listmonk),
`ALLOWED_ORIGINS`, `CONTACT_TO`, `CONTACT_FROM`.

Secrets (jamais dans le repo) :

```bash
npx wrangler secret put LISTMONK_API_USER    # utilisateur d'API créé dans Listmonk
npx wrangler secret put LISTMONK_API_TOKEN   # son token
npx wrangler secret put BREVO_API_KEY        # clé API v3 Brevo (PAS la clé SMTP)
```

## Développement local

```bash
cd services/email-gateway
pnpm install            # types + typescript
pnpm typecheck
npx wrangler dev        # sert http://localhost:8787
```

Test :

```bash
curl -s -X POST http://localhost:8787/subscribe \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"email":"test@example.com","source":"comprendre"}'
```

(Sans secrets configurés, l'appel Listmonk échoue → `502` : c'est attendu ;
`400`/`429`/honeypot/CORS se testent entièrement en local.)

## Déploiement

```bash
npx wrangler deploy
```

Le site pointe vers la passerelle via `NEXT_PUBLIC_EMAIL_ENDPOINT`
(encarts email, chemin `/subscribe`) et `NEXT_PUBLIC_CONTACT_ENDPOINT`
(formulaire de contact, chemin `/contact`) — cf. `apps/site/.env.example`.
**Tant qu'une variable n'a pas été basculée, l'ancien flux correspondant
(Worker send-email + Google Sheet) reste actif** — chaque bascule est un
changement d'environnement, pas de code.
