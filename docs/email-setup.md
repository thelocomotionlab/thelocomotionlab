# Email du Lab — mise en place de la liste (Listmonk + relais Brevo)

> Checklist **manuelle** pour Valentin. Architecture décidée en PR4 (refonte,
> chantier 1) : la liste vit **sur le VPS** (Listmonk, auto-hébergé, cf.
> `infra/compose.yml`), l'**envoi** est délégué à un relais SMTP (**Brevo**,
> gratuit jusqu'à 300 emails/jour). Le site parle à la passerelle
> `services/email-gateway` (Worker Cloudflare), qui crée les contacts dans
> Listmonk avec leur attribut `source`. Le double opt-in est activé
> (débrayable par liste dans l'UI Listmonk).
>
> **Tant que la bascule finale (étape 7) n'est pas faite, le site continue
> d'utiliser l'ancien flux (Worker send-email + Google Sheet).**

## 1. Déployer Listmonk sur le VPS (≈ 10 min)

1. Sur le VPS, `git pull` puis compléter `infra/.env` (cf. `.env.example`) :
   `LISTE_DOMAIN=liste.thelocomotionlab.com`, `LISTMONK_DB_PASSWORD`
   (long aléatoire : `openssl rand -hex 24`), `LISTMONK_ADMIN_USER`,
   `LISTMONK_ADMIN_PASSWORD`.
2. Dans Cloudflare DNS : ajouter `liste` (A → IP du VPS, proxifié, comme
   `tracking`).
3. `cd infra && ./deploy.sh` — Caddy obtient le certificat seul.
4. Vérifier : `https://liste.thelocomotionlab.com/admin` → écran de login,
   se connecter avec le compte admin de l'`.env`.

## 2. Configurer Listmonk (≈ 15 min, dans l'UI)

1. **Settings → General** : nom « The Locomotion Lab », URL racine
   `https://liste.thelocomotionlab.com`, langue FR.
2. **Lists** : créer la liste **« Le Lab »**, type *public*, opt-in
   **double**. Noter son **ID numérique** (visible dans le tableau) → le
   reporter dans `services/email-gateway/wrangler.toml`
   (`LISTMONK_LIST_ID`) s'il diffère de `1`.
3. **Admin → Users** : créer un utilisateur **API** dédié (ex.
   `email-gateway`), rôle limité à la gestion des abonnés. Copier le token
   généré (il ne s'affiche qu'une fois).
4. **Campaigns → Templates** : adapter le modèle d'email d'opt-in en
   français. Texte suggéré :
   > **Objet** : Confirme ton inscription au Locomotion Lab
   > Salut ! Tu as demandé à être prévenu·e quand quelque chose paraît au
   > Locomotion Lab. Clique ce bouton pour confirmer — et c'est tout :
   > pas de newsletter, un email quand quelque chose paraît.
5. **Settings → Media / Privacy** : rien à changer aujourd'hui.

## 3. Créer le compte Brevo (relais d'envoi, ≈ 10 min, gratuit)

1. Créer un compte sur brevo.com (plan gratuit, 300 emails/jour).
2. Menu **SMTP & API → SMTP** : relever `smtp-relay.brevo.com`, port
   `587`, le login (ton email de compte) et générer une **clé SMTP**.
3. Dans Listmonk, **Settings → SMTP** : renseigner hôte/port/login/clé
   (STARTTLS), puis « Test connection » et s'envoyer un email d'essai.
4. ⚠️ Vérifier si le plan gratuit ajoute un pied « Sent by Brevo » aux
   emails relayés : si oui et que ça gêne, add-on payant (~9 $/mois) ou
   bascule vers Amazon SES (§ Porte de sortie).

## 4. Déployer la passerelle (≈ 5 min)

```bash
cd services/email-gateway
npx wrangler secret put LISTMONK_API_USER    # ex. email-gateway
npx wrangler secret put LISTMONK_API_TOKEN   # le token copié en 2.3
npx wrangler deploy                          # → URL https://email-gateway.<compte>.workers.dev
```

Test de bout en bout : depuis le site en local
(`NEXT_PUBLIC_EMAIL_ENDPOINT=https://…workers.dev/subscribe pnpm dev:site`),
s'inscrire avec une vraie adresse → l'email de confirmation arrive → après
clic, le contact apparaît dans Listmonk avec `source` dans ses attributs.

## 5. Importer le Google Sheet existant

Dans Listmonk, **Subscribers → Import** : CSV avec colonnes
`email,name,attributes` — mettre `{"source": "legacy"}` en attributs,
cocher **« Mark as confirmed »** (⚠️ import tel quel, SANS double opt-in
rétroactif : ces contacts se sont inscrits via l'ancien formulaire, base
légale d'origine — le formulaire du site — documentée ici même).

## 6. (Chantier 2, AVANT la première campagne — annonce Écrins)

Authentifier le domaine : ajouter les enregistrements **SPF/DKIM** de
Brevo dans le DNS Cloudflare (Brevo → Senders & Domains → Domains). Sans
ça, les campagnes partiront mais seront moins bien délivrées.

## 7. La bascule (quand les tests sont concluants)

1. Dans Cloudflare Pages (projet du site) : ajouter la variable de build
   `NEXT_PUBLIC_EMAIL_ENDPOINT=https://email-gateway.<compte>.workers.dev/subscribe`
   puis redéployer le site. (C'est un changement d'env, pas de code.)
2. Vérifier une inscription réelle depuis le site en production.
3. **Mettre l'Apps Script à la retraite** (le Google Sheet ne reçoit plus
   rien) et archiver l'ancien Worker send-email quand plus rien ne l'utilise
   (le formulaire de contact et SoutenirSection l'utilisent encore — hors
   périmètre PR4).

## Porte de sortie : Amazon SES

Si la liste dépasse ~300 contacts (une annonce = un envoi à toute la liste,
le plafond quotidien devient réel) ou si le logo Brevo gêne : créer un
compte AWS SES (~0,10 $/1 000 emails, aucun logo, demande de sortie de
sandbox à prévoir), puis remplacer le SMTP dans **Listmonk → Settings →
SMTP**. Rien d'autre ne change : ni la liste, ni la passerelle, ni le site.

## Sauvegardes

La liste est une donnée personnelle hébergée chez nous :
`infra/README.md § Sauvegardes` (pg_dump ciblé, à lancer après chaque
campagne ou en cron hebdomadaire).
