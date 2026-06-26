# Comprendre l'infra du VPS — guide pour néophyte total

> Ce guide explique, **sans rien supposer de connu**, ce qu'on a construit sur le serveur et **pourquoi**.
> Chaque terme technique est défini la première fois qu'il apparaît. À lire dans l'ordre.

---

## 1. L'objectif, en une phrase

On a transformé un **serveur loué chez OVH** en une **base propre et automatisée** capable d'accueillir
les « cerveaux » (les *backends*) de tes futures applications, accessibles sur internet en **HTTPS**
(connexion sécurisée), **sans casser** le suivi GPS (**Traccar**) qui y tournait déjà.

---

## 2. Le décor : c'est quoi un « serveur » / un « VPS » ?

- **Serveur** : un ordinateur **toujours allumé et branché à internet**, dont le métier est de **servir**
  des choses (pages web, données) à qui les demande.
- **VPS** = *Virtual Private Server* = **serveur privé virtuel**. C'est une **tranche** d'un gros
  ordinateur (chez OVH) qui se comporte comme **ton** ordinateur dédié. Tu y accèdes **à distance**.
- Différence clé avec ton PC : il a une **adresse publique fixe** sur internet → n'importe qui peut le
  contacter.

### Adresse IP, nom de domaine, DNS
- **Adresse IP** : l'adresse **numérique** du serveur (`37.59.121.109`). Comme un **numéro de
  téléphone**.
- **Nom de domaine** : un nom **lisible** (`thelocomotionlab.com`). Plus facile à retenir qu'un numéro.
- **DNS** (*Domain Name System*) : **l'annuaire** qui traduit le nom → l'IP. Quand on a créé
  l'« enregistrement DNS » `template → 37.59.121.109`, on a **ajouté une ligne dans l'annuaire** :
  « le sous-domaine `template.thelocomotionlab.com`, c'est ce serveur-là ».

---

## 3. Le problème de fond : faire cohabiter plusieurs apps proprement

Méthode à l'ancienne : on installe les logiciels **en vrac, directement sur la machine**. Ça marche,
mais : les apps **s'emmêlent** (une mise à jour en casse une autre), c'est **dur à reproduire** à
l'identique, et **dur à nettoyer**. La solution moderne : les **conteneurs**.

---

## 4. Conteneurs & Docker (le concept central)

- **Conteneur** : imagine un **conteneur maritime** : une **boîte scellée** qui contient une app **+
  tout ce qu'il lui faut** pour tourner (son code, ses dépendances, sa version de langage). Cette boîte
  tourne **à l'identique partout**.
- **Docker** : l'**outil** qui **fabrique** et **fait tourner** ces boîtes.
- **Image** vs **Conteneur** :
  - **Image** = la boîte **figée** (le **moule**, en lecture seule). C'est une **recette compilée**.
  - **Conteneur** = une image **en train de tourner** (le **gâteau** sorti du moule).
  - Une **image** → on peut lancer **plusieurs conteneurs** identiques.
- **Dockerfile** : la **recette écrite** (étape par étape) qui dit **comment fabriquer l'image**
  (« pars de Node, copie le code, compile-le… »). Chez nous : `apps/_template/Dockerfile`.

**Pourquoi des conteneurs ?** Isolation (chaque app dans sa boîte, elles ne se gênent pas) +
reproductibilité (« ça marche sur mon PC » devient « ça marche sur le serveur », **garanti**).

---

## 5. Où on range les images : le « registre » (GHCR)

- **Registre** : un **entrepôt d'images**. On y **dépose** (`push`) et on y **récupère** (`pull`) des
  images. (Comme une bibliothèque de moules.)
- **GHCR** (*GitHub Container Registry*) : l'entrepôt **de GitHub**. (Équivalent de « Docker Hub », mais
  rattaché à ton compte GitHub.)
- **Pourquoi ?** L'image est **fabriquée une seule fois** (par un robot, voir §9), rangée dans
  l'entrepôt, et le serveur n'a plus qu'à la **tirer** (`pull`). Le serveur reste **léger et propre** :
  il **exécute** des images, il n'en **fabrique** pas.
- **Public / privé** : qui a le droit de **tirer** l'image. **Public** = tout le monde, sans mot de
  passe. **Privé** = seulement avec un **jeton** (*token*) d'accès. (On a choisi privé + jeton.)

---

## 6. Le portier : le « reverse-proxy » (Caddy)

**Le problème** : plusieurs apps, mais **une seule** adresse (IP) et **une seule** porte d'entrée
sécurisée. Comment envoyer chaque visiteur vers la bonne app ?

- **Reverse-proxy** : le **portier / standardiste** à l'entrée du bâtiment. **Tous** les visiteurs
  arrivent à l'accueil ; selon le **nom** demandé (le sous-domaine), le portier **dirige** vers le bon
  bureau (le bon conteneur).
- **Caddy** : le **logiciel-portier** qu'on a choisi. **Gros avantage** : il gère le **HTTPS tout seul**
  (voir §7).
- **Ports** : un bâtiment a **une** adresse de rue (l'IP) mais **plein de portes numérotées** : les
  **ports**. Le port **443** = la porte **HTTPS**, le **80** = la porte **HTTP**. Pendant les tests, on
  a mis Caddy sur des **portes de service** (`8081`/`8443`) pour **ne pas déranger** les portes
  principales (`80`/`443`) qu'utilisait déjà le tracking.

> Pourquoi « reverse » proxy ? Un proxy « normal » protège le **visiteur** ; un proxy **inverse**
> protège et aiguille côté **serveur**. D'où le nom.

---

## 7. Le cadenas : HTTPS, TLS, certificat

- **HTTP** : la **langue** que parlent le navigateur et le serveur pour échanger des pages.
- **HTTPS** : la **même langue, mais chiffrée** (le « S » = *secure*). C'est le **cadenas** dans la barre
  d'adresse. Personne entre les deux ne peut lire ce qui passe.
- **TLS** : la **technologie de chiffrement** derrière le HTTPS.
- **Certificat** : la **carte d'identité numérique** du site. Elle (a) **prouve** « je suis bien
  `template.thelocomotionlab.com` » et (b) **active** le chiffrement. Délivrée par une **autorité de
  confiance**.
- **Let's Encrypt** : l'autorité qui délivre ces cartes **gratuitement**.
- **Le hic** : ces cartes **expirent** (~90 jours) → il faut les **renouveler**. **Caddy le fait
  automatiquement** : c'est tout son intérêt (avec l'ancien outil, nginx, il fallait s'en occuper à la
  main).
- **Comment Caddy prouve qu'on possède le domaine** (pour obtenir la carte) : le défi **« DNS-01 »** →
  il **ajoute un enregistrement DNS secret** via l'**API de Cloudflare** (un accès programmé à ton
  compte Cloudflare). On a choisi cette méthode car elle marche **même derrière Cloudflare** et **sans
  exposer** le serveur. C'est à ça que sert le secret `CF_API_TOKEN`.

---

## 8. Le garde du corps devant : Cloudflare

- **Cloudflare** se place **entre les visiteurs et ton serveur**.
- Image : un **videur + accélérateur** devant ton bâtiment. Les visiteurs parlent à **Cloudflare** ;
  Cloudflare parle à **ton serveur** (« l'origine »).
- **Avantages** : **cache** (sert les pages plus vite), **cache l'IP réelle** du serveur, **absorbe les
  attaques**, HTTPS au bord.
- **« Proxied » (nuage orange)** : le trafic **passe par** Cloudflare. (Inverse : « DNS-only », nuage
  gris = direct au serveur.)
- **« Origin Rule → 8443 »** : on a dit à Cloudflare « pour ce sous-domaine, va frapper à la **porte
  8443** du serveur » (parce que Caddy était sur la porte de service pendant les tests).
- **« Blocage IA/bots OFF »** : on a demandé à Cloudflare de **ne pas bloquer** les robots/IA (ton
  choix explicite).
- **TLS « Full (strict) »** : Cloudflare exige que l'origine ait **aussi** un vrai certificat valide
  (ce que Caddy fournit) → chiffré **et vérifié** de bout en bout.

---

## 9. Le robot qui fabrique tout seul : CI/CD (GitHub Actions)

- **CI/CD** (*Continuous Integration / Continuous Deployment*) : un **robot** qui exécute des tâches
  **automatiquement** quand tu envoies du code.
- **GitHub Actions** : le **service-robot de GitHub**.
- **Workflow** : la **recette** du robot (notre fichier `.github/workflows/deploy-vps.yml`).
- **Ce qu'il fait chez nous** : à chaque envoi de code sur `main`, il **(1)** fabrique l'image Docker de
  l'app, **(2)** la **dépose dans GHCR**.
- **Pourquoi ?** Fabrication **automatique** et **identique à chaque fois**, sans manip manuelle. Et le
  serveur reste propre (il ne build rien).

---

## 10. La mémoire du projet : Git

- **Git** : le système qui **enregistre chaque modification** du code, avec la possibilité de **revenir
  en arrière**.
- **Repo (dépôt)** : le dossier du projet suivi par Git.
- **Commit** : une **photo sauvegardée** d'un lot de modifs, avec un **message** qui explique.
- **Branche** : une **ligne de travail parallèle**. On a bossé sur la branche `claude/cool-turing-…`
  pour **ne pas perturber** `main`.
- **`main`** : la branche **officielle / de production** (c'est elle qui alimente le **site** sur
  Cloudflare Pages).
- **Merge (fusion)** : amener les modifs d'une branche dans une autre.
- **Push** : **envoyer** ses commits sur GitHub (le serveur central partagé).
- **« Infra-as-code »** (infrastructure **en tant que code**) : **toute** la config du serveur est
  écrite dans des **fichiers versionnés** (dans le repo), **pas bricolée à la main** sur la machine.
  **Pourquoi ?** Reproductible, relisible, annulable. **Règle d'or du projet** : *on n'édite jamais le
  serveur à la main*.

---

## 11. L'architecture complète (le schéma, maintenant que tu as le vocabulaire)

```
        TOI (navigateur, n'importe où)
                 │  https://template.thelocomotionlab.com
                 ▼
        ┌──────────────────┐
        │    CLOUDFLARE     │   videur + cache devant ; envoie vers l'origine:8443
        └────────┬─────────┘
                 │
                 ▼   (ton VPS OVH)
   ┌──────────────────────────────────────────────┐
   │  CADDY  (le portier, HTTPS auto)               │
   │    template.…  → conteneur "template" (Next)   │
   │    tracking.…  → Traccar (déjà là, intact)     │
   │    twin.… / api.…  → (futurs conteneurs)       │
   └──────────────────────────────────────────────┘

   ET, en coulisses, comment le code arrive jusque-là :

   Tu modifies le code → git push sur "main"
        → GitHub Actions (robot) FABRIQUE l'image → la dépose dans GHCR (entrepôt)
        → sur le VPS, le script "deploy.sh" TIRE l'image depuis GHCR et (re)lance le conteneur
        → Caddy le sert en HTTPS, derrière Cloudflare.
```

**Deux idées à retenir** :
1. **Une seule porte publique** = Caddy. Il aiguille par **nom de sous-domaine**.
2. **Le code voyage** : ton PC → GitHub → robot (image) → entrepôt → serveur. Personne ne « bricole »
   sur le serveur.

---

## 12. Ce qu'on a fait, dans l'ordre, et pourquoi

1. **Réversibilité d'abord.** Avant de toucher à quoi que ce soit : prévoir comment **tout annuler**
   (snapshot du serveur, sauvegarde de Traccar, inventaire de l'existant). *Pourquoi : ne jamais se
   retrouver coincé sans filet.*
2. **Une décision documentée (un « ADR »).** Un **ADR** = *Architecture Decision Record* = une note qui
   fige **un choix d'architecture et ses raisons**. Ici : **Caddy + GHCR** plutôt que l'outil
   « Coolify ». *Pourquoi Caddy : léger, et 100 % de la config vit dans le repo.*
3. **Construction de `infra/`.** Le **portier** (Caddy), le **chef d'orchestre** des conteneurs
   (`compose.yml` — un fichier qui décrit quels conteneurs lancer et comment), le **script de
   déploiement** (`deploy.sh`), et les **secrets** rangés hors du repo (fichier `.env` **non
   versionné** ; seul un modèle `.env.example` **sans valeurs** est dans le repo).
4. **L'incident du verrouillage** (voir §13).
5. **Mise en route** : installer Docker, déployer l'app de test, brancher Cloudflare, puis valider le
   **flux automatique** CI → GHCR → serveur.

---

## 13. L'incident du verrouillage (la grosse galère) — et la leçon

**Ce qui s'est passé** : après avoir installé Docker, on s'est retrouvés **incapables de se reconnecter
au serveur** (« permission denied »), alors que le mot de passe était bon.

**Les termes pour comprendre** :
- **SSH** : la façon **sécurisée de se connecter à distance** à la **ligne de commande** d'un serveur
  (un terminal noir où on tape des commandes).
- **Mot de passe** vs **clé SSH** : deux façons de prouver son identité en SSH. Le **mot de passe** = un
  secret qu'on tape. La **clé SSH** = une paire mathématique (une **clé publique** posée sur le serveur,
  une **clé privée** gardée sur ton PC) ; plus sûre, et **insensible** au piège ci-dessous.
- **cloud-init** : un programme qui **configure un serveur cloud à son démarrage** (crée l'utilisateur,
  le réseau…). **Le piège** : il était réglé pour **re-verrouiller le mot de passe à chaque
  redémarrage** → d'où le « permission denied ».
- **Snapshot** : une **photo de tout le disque** du serveur à un instant T, qu'on peut **restaurer**.
  C'est ce qui nous a **sauvés**.
- **Mode rescue** : démarrer le serveur sur un **OS de secours** (fourni par OVH) pour le **réparer**
  quand on est enfermé dehors.

**Comment on s'en est sortis** : tu as **restauré le snapshot** (retour à l'état d'avant), puis on a
**neutralisé le piège** : **désactivé cloud-init**, ajouté une **clé SSH** en secours, et **testé un
redémarrage** pour vérifier que l'accès tient.

**La leçon (gravée dans `docs/runbook-vps.md`, « étape 0 bis »)** — les **3 règles d'or** :
1. **Un snapshot frais avant chaque opération risquée.**
2. **Deux accès** : mot de passe (depuis partout) **+** clé SSH (filet de secours).
3. **Tester un redémarrage** après tout changement d'accès, **tant qu'on peut encore se reconnecter**.

---

## 14. Les secrets (mots de passe, jetons) — la règle

Un **secret** = une valeur sensible (mot de passe, jeton d'API). **Règle absolue** : **aucun secret
dans le repo**. Ils vivent dans un fichier **`.env`** sur le serveur, **non versionné**. Le repo ne
contient qu'un **modèle vide** (`.env.example`). Et si un secret **fuite** (p. ex. collé par erreur
dans un chat), on le considère **compromis** → on le **régénère** côté fournisseur. *(C'est pour ça
qu'on a régénéré tes tokens Traccar et GitHub.)*

---

## 15. Où on en est, et ce qui reste

| Brique | Rôle | État |
| --- | --- | --- |
| Accès VPS blindé (anti-verrouillage) | ne plus jamais être enfermé dehors | ✅ |
| Docker | faire tourner des conteneurs | ✅ installé |
| Caddy | portier + HTTPS automatique | ✅ tourne |
| App `template` (conteneur de test) | valider toute la chaîne | ✅ servie en HTTPS |
| Cloudflare devant (IA non bloquée) | videur/cache + HTTPS au bord | ✅ |
| Traccar (tracking GPS) | inchangé, toujours fonctionnel | ✅ |
| Flux CI → GHCR → serveur | déployer automatiquement | ✅ bouclé |
| Tout versionné dans le repo | infra-as-code | ✅ sur `main` |

**Ce qui reste (quand tu voudras) :**
- **Bascule de Traccar derrière Caddy** : aujourd'hui il est servi par l'ancien portier (nginx) ; on
  pourra le passer derrière Caddy. C'est une étape **réversible et préparée** (runbook étape 4).
- **Le grand « rebuild » tout-conteneurs** : mettre Traccar **aussi** en conteneur, nettoyer la machine,
  etc. (4 choix à trancher — une autre session).

**En résumé** : on a posé une **fondation propre, sécurisée et automatique**. Tu pousses du code → il
se retrouve **en ligne, en HTTPS, tout seul**, sans toucher au serveur à la main, et sans casser
l'existant.
