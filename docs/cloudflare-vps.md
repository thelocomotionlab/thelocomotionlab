# Cloudflare devant le VPS (proxy/CDN) — sous-domaines servis par le VPS

> **À ne pas confondre** avec [`docs/deploy-cloudflare.md`](./deploy-cloudflare.md), qui concerne le
> **site** sur Cloudflare **Pages**. Ce document-ci concerne les **sous-domaines servis par le VPS**
> (Caddy) : `template.thelocomotionlab.com` (test), puis `twin.*`, `api.*`, et — à la bascule —
> `tracking.*`.
>
> ⚠️ Procédure **pour toi** (réglages dans le dashboard Cloudflare). Claude n'a rien modifié sur
> Cloudflare. Commandes serveur associées : [`docs/runbook-vps.md`](./runbook-vps.md).

La zone `thelocomotionlab.com` est gérée par Cloudflare. On met Cloudflare **en proxy (orange cloud)**
devant les sous-domaines du VPS, **sans** activer le blocage IA/bots, avec un **TLS strict** vers
l'origine (Caddy présente un vrai certificat Let's Encrypt).

---

## 1. Token API Cloudflare pour le DNS-01 (certificats Caddy)

Caddy obtient/renouvelle ses certificats via **DNS-01** : il crée un enregistrement TXT temporaire par
l'API Cloudflare. Il faut donc un **token scopé** (jamais la clé globale).

Dashboard → **My Profile → API Tokens → Create Token → Create Custom Token** :

| Réglage | Valeur |
| --- | --- |
| **Permissions** | `Zone` · `DNS` · **Edit** — ET — `Zone` · `Zone` · **Read** |
| **Zone Resources** | `Include` · `Specific zone` · **thelocomotionlab.com** |

Copie le token et mets-le dans `infra/.env` (sur le VPS) : `CF_API_TOKEN=...` (cf.
[`infra/.env.example`](../infra/.env.example) et [`docs/secrets.md`](./secrets.md)). **Aucun token
dans le repo.**

> DNS-01 fonctionne **même quand le sous-domaine est proxifié (orange)** et **sans port 80 ouvert** —
> c'est ce qui permet de valider sur des ports alternatifs sans toucher Traccar.

---

## 2. Enregistrement DNS du sous-domaine de test

Dashboard → **DNS → Records → Add record** :

| Champ | Valeur |
| --- | --- |
| **Type** | `A` (et `AAAA` si ton VPS a une IPv6) |
| **Name** | `template` |
| **IPv4 address** | l'**IP publique de ton VPS** |
| **Proxy status** | **Proxied** (nuage **orange**) |

> Ne touche pas aux enregistrements du **site** (apex/`www`) gérés par l'intégration Cloudflare
> **Pages**. On n'ajoute que des sous-domaines **VPS**.

---

## 3. Mode TLS de la zone : **Full (strict)**

Dashboard → **SSL/TLS → Overview → Configure** → **Full (strict)**.

Caddy présente un certificat Let's Encrypt **valide** à l'origine → `Full (strict)` est le bon
réglage (chiffré **et** vérifié de bout en bout). Ce réglage est **au niveau de la zone** : il
s'applique aussi à `tracking.*` (nginx, certificat LE valide lui aussi) et n'impacte pas le site
(Pages). Si la zone est aujourd'hui en `Full` (non strict) ou `Flexible`, passer à `Full (strict)`
est une amélioration sans risque ici.

---

## 4. Désactiver le blocage IA / bots (exigence du projet)

Cloudflare propose des protections « bots » qui peuvent **bloquer des clients automatisés légitimes**
(et casser des API). On les **laisse désactivées**.

Dashboard → **Security → Bots** *(selon la version du dashboard : **Security → Settings**, ou la
section **Bots** dédiée)* :

- **Bot Fight Mode** → **Off**.
- **Block AI bots** / **AI Scrapers and Crawlers** → **Off / Désactivé** (ne pas choisir *Block* ni
  *Block on managed routes*).

> Repère tout libellé contenant **« AI bots »**, **« AI Scrapers/Crawlers »** ou **« Bot Fight
> Mode »** et mets-le sur **Off**. (Le bouton « bloquer les IA » est précisément celui que ce projet
> veut **désactivé**.) Si tu utilises l'**AI Audit** au niveau du compte, laisse-le en observation,
> **pas** en blocage.

---

## 5. Mode VALIDATION : Origin Rule → port 8443 (sans libérer 443)

Pendant la validation, Caddy écoute sur **8443** côté VPS (nginx garde 443). On dit à Cloudflare de
**joindre l'origine sur 8443** pour ce sous-domaine, alors que le visiteur, lui, reste en 443 standard.

Dashboard → **Rules → Origin Rules → Create rule** :

| Champ | Valeur |
| --- | --- |
| **Nom** | `template → origin 8443` |
| **When incoming requests match** | `Hostname` · `equals` · `template.thelocomotionlab.com` |
| **Then… Rewrite to** | **Destination Port** = `8443` |

Déploie la règle. Côté VPS, **ouvre le port 8443** entrant (cf. runbook étape 2 : `ufw` et,
éventuellement, le pare-feu OVH du Manager).

> Résultat : `https://template.thelocomotionlab.com` (443 public, edge Cloudflare) → origine
> `VPS:8443` (Caddy) → conteneur `template:3000`. **Traccar (443 = nginx) n'est pas touché.**

---

## 6. À la BASCULE (plus tard) — repasser en 443 standard

Quand Caddy prendra 80/443 (runbook étape 4) :

1. **Supprime l'Origin Rule** de l'étape 5 (Caddy répond désormais sur 443 standard).
2. Referme le port 8443 si tu l'avais ouvert (`sudo ufw delete allow 8443/tcp`).
3. Pour `tracking.thelocomotionlab.com` : tu peux le laisser **tel qu'aujourd'hui** (ne change pas son
   mode proxy pendant la bascule, pour limiter les variables) ; il pourra passer en *Proxied* ensuite.
   Caddy obtiendra son certificat pour `tracking.*` par DNS-01 quoi qu'il arrive.

---

## Récapitulatif des réglages

| Réglage Cloudflare | Validation (maintenant) | Bascule (plus tard) |
| --- | --- | --- |
| Token API DNS-01 (`CF_API_TOKEN`) | requis | requis |
| DNS `template` → IP VPS, **Proxied** | oui | oui |
| TLS zone | **Full (strict)** | Full (strict) |
| Bot Fight Mode / Block AI | **Off** | Off |
| Origin Rule port → 8443 | **oui** (`template`) | **supprimée** |
