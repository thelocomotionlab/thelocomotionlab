# email-gateway — passerelle de capture email (Worker Cloudflare)

Reçoit les inscriptions des formulaires du site et crée le contact dans
**Listmonk** (auto-hébergé sur le VPS, cf. `infra/compose.yml`) avec son
attribut `source`. Listmonk envoie ensuite l'email de confirmation
(**double opt-in**) via le relais SMTP configuré dans son interface (Brevo).

La mise en place complète (Listmonk, Brevo, DNS, bascule du site) est
décrite dans [`docs/email-setup.md`](../../docs/email-setup.md).

## API

`POST /subscribe` — corps JSON :

```json
{ "email": "personne@example.com", "source": "comprendre" }
```

- `source` ∈ `quete · comprendre · twin · live · home` (+ `footer` et
  `manifeste`, valeurs historiques tolérées).
- Champ `website` = honeypot : doit rester vide (rempli par les robots →
  faux succès, rien n'est créé).
- Réponses : `200 {"ok":true}` (aussi si l'adresse était déjà inscrite —
  pas d'énumération), `400` (email/source invalides), `429` (débit),
  `502` (Listmonk injoignable).
- CORS restreint aux origines du site + `http://localhost:3000` (dev).

## Configuration

Variables non secrètes dans `wrangler.toml` : `LISTMONK_URL`,
`LISTMONK_LIST_ID` (à ajuster après création de la liste dans Listmonk),
`ALLOWED_ORIGINS`.

Secrets (jamais dans le repo) :

```bash
npx wrangler secret put LISTMONK_API_USER    # utilisateur d'API créé dans Listmonk
npx wrangler secret put LISTMONK_API_TOKEN   # son token
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
(cf. `apps/site/.env.example`) : **tant que cette variable n'a pas été
basculée, l'ancien flux (Worker send-email + Google Sheet) reste actif** —
la bascule est un changement d'environnement, pas de code.
