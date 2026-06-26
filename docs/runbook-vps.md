# Runbook VPS — Locomotion Lab

> **Pour qui / pourquoi.** Liste **exacte** des commandes à exécuter **toi-même** sur le VPS OVH
> (Ubuntu) pour en faire un **hôte propre à conteneurs** (déploiement depuis ce repo + HTTPS
> automatique) **sans casser Traccar**. Claude n'a **pas** d'accès SSH : il écrit l'infra (`infra/`)
> et ce runbook ; **c'est toi qui lances tout sur le serveur**.
>
> Contexte d'archi : [`CLAUDE.md`](../CLAUDE.md) · Décision de déploiement :
> [`docs/adr/0001-deploiement-vps.md`](./adr/0001-deploiement-vps.md) · Organisation de l'infra :
> [`infra/README.md`](../infra/README.md) · Cloudflare devant le VPS :
> [`docs/cloudflare-vps.md`](./cloudflare-vps.md).

## Conventions

- `# sur le VPS` = commande à lancer **sur le serveur** (SSH depuis ta machine, p. ex.
  `ssh ubuntu@<IP_DU_VPS>`).
- Les commandes **lecture seule** (inventaire, `status`, `df`, `ss`, `nginx -T`…) sont **sans risque** :
  elles n'écrivent rien.
- ⚠️ Les commandes marquées **DESTRUCTIVE / IMPACT PROD** ne se lancent **qu'après** snapshot +
  sauvegarde (étape 0) et **validation explicite**. Le plan de **rollback** accompagne chacune.
- Toujours adapter `<IP_DU_VPS>`, le nom d'utilisateur SSH, etc. à ton install.

## Sommaire des étapes

| Étape | But | Risque | Statut |
| --- | --- | --- | --- |
| **0** | Réversibilité : snapshot OVH + sauvegarde Traccar + **inventaire** | nul (lecture/backup) | détaillée ci-dessous |
| **0 bis** | **Blinder l'accès SSH** (anti-lockout cloud-init) — ⚠️ à faire **avant** le 1 | faible (mais critique) | détaillée ci-dessous |
| **1** | Installer Docker (si absent) | faible | détaillée ci-dessous |
| **2** | Déployer `apps/_template` en **mode validation** (ports 8080/8443) | nul pour Traccar | détaillée ci-dessous |
| **3** | Cloudflare devant + validation HTTPS externe | nul pour Traccar | détaillée ci-dessous |
| **4** | **Bascule Traccar** derrière Caddy (80/443) | **IMPACT PROD** — *gated* | détaillée ci-dessous |

> **Commence par l'étape 0** : elle est autonome et me fournit l'inventaire (`nginx -T` complet) dont
> dépend la **finalisation** du bloc Traccar (étape 4). Les étapes 1→3 ne touchent **pas** Traccar.

---

# Étape 0 — Réversibilité d'abord (à faire **avant tout le reste**)

Objectif : pouvoir **tout annuler** si quoi que ce soit tourne mal. Trois choses, dans l'ordre :
**(A)** un snapshot de la VM (revenir à l'état actuel en un clic), **(B)** une sauvegarde applicative
de Traccar (restaurer juste Traccar sans toucher au reste), **(C)** un inventaire en lecture seule (me
le coller pour que j'adapte l'infra à ton serveur réel).

## 0.A — Snapshot OVH de la VM (filet de sécurité global)

Le **snapshot** OVH fige l'état complet du disque de la VM ; tu peux y **revenir** ensuite. C'est le
filet le plus large (il couvre Traccar **et** tout le reste).

**Voie recommandée — OVH Manager (interface web)** :

1. Connecte-toi à l'[espace client OVH](https://www.ovh.com/manager/).
2. Section **Bare Metal Cloud → VPS** (ou **Serveur privé virtuel**) → sélectionne ton VPS.
3. Onglet/menu **« Snapshot »** (ou le menu d'actions **« … »** → *Prendre un snapshot*).
4. Lance la prise de snapshot et **attends qu'il soit « actif »** avant de continuer.

> OVH offre **1 emplacement de snapshot gratuit** par VPS (point de restauration unique). Pour une
> sauvegarde plus pérenne/multiple, l'option payante « Automated/Snapshot Backup » existe, mais pour
> cette opération un snapshot manuel suffit.

**Voie alternative — API OVH** (si tu préfères scripter ; nécessite tes clés API OVH) :
`POST /vps/{serviceName}/snapshot` sur `https://eu.api.ovh.com/`. Plus lourd à mettre en place
(signature appKey/appSecret/consumerKey) que l'interface ; à réserver si tu automatises. Pour un
one-shot, l'interface Manager est plus simple.

**Pour revenir en arrière** (si besoin) : même écran → **restaurer le snapshot**. La VM repart dans
l'état figé. C'est l'annulation « tout ou rien ».

## 0.B — Sauvegarde applicative de Traccar (restaurable indépendamment)

Plus fin que le snapshot : une archive de la **donnée** et de la **config** Traccar, qu'on peut
restaurer **sans** rejouer tout le disque. On **arrête** Traccar le temps de la copie pour garantir
une base cohérente (la base H2 par défaut ne doit pas être copiée « à chaud »), puis on **redémarre**.

> **Pré-vérification (lecture seule)** — confirme le nom du service et les chemins (les valeurs par
> défaut de l'install Traccar sont `traccar.service` + `/opt/traccar/{data,conf}`) :
>
> ```bash
> # sur le VPS
> systemctl status traccar --no-pager        # le service s'appelle-t-il bien "traccar" ?
> ls -ld /opt/traccar /opt/traccar/data /opt/traccar/conf   # ces chemins existent-ils ?
> ```
>
> Si le service ou les chemins diffèrent, **adapte** les commandes ci-dessous en conséquence.

```bash
# sur le VPS — SAUVEGARDE TRACCAR
# 1) Arrêt propre (la donnée s'arrête d'être écrite → copie cohérente)
sudo systemctl stop traccar

# 2) Archive horodatée de data + conf dans ton home
sudo tar czf ~/traccar-backup-$(date +%F-%H%M).tar.gz -C /opt/traccar data conf

# 3) Redémarrage immédiat
sudo systemctl start traccar

# 4) Vérifs : service actif + archive bien créée
systemctl status traccar --no-pager
ls -lh ~/traccar-backup-*.tar.gz
```

> ⏱️ L'arrêt ne dure que le temps de la copie (quelques secondes à quelques dizaines de secondes selon
> la taille de la base). Pendant ce court instant, l'UI Traccar et l'API publique sont indisponibles.
> Choisis un moment calme si tu veux éviter toute coupure visible.

**Restauration de cette sauvegarde** (procédure réversible, à n'utiliser qu'en cas de souci Traccar) :

```bash
# sur le VPS — RESTAURATION (⚠️ écrase data + conf par le contenu de l'archive)
sudo systemctl stop traccar
sudo tar xzf ~/traccar-backup-AAAA-MM-JJ-HHMM.tar.gz -C /opt/traccar   # remplace par ton fichier
sudo systemctl start traccar
systemctl status traccar --no-pager
```

## 0.C — Inventaire en lecture seule (à me coller)

Cette section **ne modifie rien**. Elle photographie l'état du VPS pour que j'adapte `infra/` (ports
réels, présence de Docker, **config nginx complète** de Traccar, certificats, pare-feu…). Copie-colle
**tout le bloc** ci-dessous : il écrit un rapport dans `~/vps-inventory.txt`, puis l'affiche.

```bash
# sur le VPS — INVENTAIRE LECTURE SEULE (aucune écriture système ; ne crée qu'un fichier rapport)
OUT=~/vps-inventory.txt
{
  echo "===== OS / NOYAU ====="
  (lsb_release -a 2>/dev/null || cat /etc/os-release); uname -a

  echo; echo "===== SERVICES ACTIFS (systemd) ====="
  systemctl list-units --type=service --state=running --no-pager

  echo; echo "===== PORTS EN ÉCOUTE (process) ====="
  sudo ss -tulpn

  echo; echo "===== DOCKER (présent ? version ?) ====="
  (docker version 2>/dev/null || echo "docker: absent")
  (docker compose version 2>/dev/null || echo "docker compose: absent")
  systemctl is-active docker 2>/dev/null || true

  echo; echo "===== OCCUPATION DISQUE / MÉMOIRE ====="
  df -h; echo; free -h; echo
  sudo du -sh /opt/traccar 2>/dev/null || true

  echo; echo "===== CRONS ====="
  (sudo crontab -l 2>/dev/null || echo "crontab root: vide/absent")
  ls -la /etc/cron.d /etc/cron.daily /etc/cron.hourly 2>/dev/null
  sudo ls -la /var/spool/cron/crontabs 2>/dev/null || true

  echo; echo "===== NGINX : version + sites + CONFIG COMPLÈTE ====="
  nginx -v 2>&1 || echo "nginx: absent"
  ls -la /etc/nginx/sites-enabled 2>/dev/null
  sudo nginx -T 2>&1     # <-- CONFIG COMPLÈTE : indispensable pour reproduire Traccar fidèlement

  echo; echo "===== CERTIFICATS TLS ====="
  sudo certbot certificates 2>/dev/null || echo "certbot: absent"
  sudo ls -la /etc/letsencrypt/live 2>/dev/null || true

  echo; echo "===== PARE-FEU (besoin d'ouvrir 8443 pour la validation) ====="
  sudo ufw status verbose 2>/dev/null || echo "ufw: absent/inactif"
  echo "--- iptables (résumé) ---"; sudo iptables -S 2>/dev/null | head -n 40 || true
} | tee "$OUT"

echo; echo ">>> Rapport écrit dans $OUT — colle son contenu à Claude."
```

> **Ce que je vais regarder dans ta sortie** (et pourquoi) :
> - `sudo nginx -T` → la **config Traccar complète**. L'extrait connu (dans
>   `apps/site/notes_pratiques.txt`) est **partiel** ; le front appelle aussi
>   `tracking.thelocomotionlab.com/live-positions.json` et `/live-timer.json` — je dois voir **comment
>   ces routes sont servies** pour les reproduire à l'identique avant toute bascule.
> - `ss -tulpn` → confirmer que Traccar écoute bien sur `127.0.0.1:8082` et repérer d'éventuels autres
>   ports occupés (pour ne pas entrer en conflit).
> - Docker présent ou non → l'étape 1 (installation) devient conditionnelle.
> - `certbot certificates` + chemins LE → savoir ce que nginx sert aujourd'hui (on n'y touche pas en
>   phase de validation).
> - `ufw`/`iptables` → vérifier qu'on pourra **ouvrir le port 8443** (Cloudflare → origine) en phase
>   de validation, **sans** toucher 80/443.

---

# Étape 0 bis — Blinder l'accès SSH (anti-lockout cloud-init) ⚠️ AVANT le reste

> **Pourquoi cette étape existe (retour d'expérience).** L'image Ubuntu du VPS embarque **cloud-init**
> configuré avec `lock_passwd: True` + module `set_passwords` (visible dans `/etc/cloud/cloud.cfg`).
> Sur certains reboots (notamment après des cycles **rescue**), cloud-init **se ré-exécute et
> re-verrouille le mot de passe de `ubuntu`** → `Permission denied` même avec le bon mot de passe,
> et la clé SSH peut être réécrite. Sans accès de secours **reboot-testé**, on se retrouve **enfermé
> dehors** (seul le **snapshot OVH** sauve). On blinde donc l'accès **avant** d'installer Docker ou de
> rebooter.

**Les 3 règles d'or (à respecter pour TOUTE opération serveur ensuite) :**
1. **Snapshot OVH avant chaque étape risquée** (install, reboot, bascule).
2. **Deux accès** : mot de passe (principal, de partout) **+** clé SSH (filet, depuis ton poste).
3. **Tester un reboot après tout changement d'accès**, tant qu'on peut encore se reconnecter.

```bash
# sur le VPS (connecté en ubuntu, sudo dispo)

# 1) Vérifier que le réseau est figé dans netplan (=> on peut couper cloud-init sans perdre le réseau)
ls -la /etc/netplan/                          # doit lister 50-cloud-init.yaml

# 2) Désactiver cloud-init (il ne ré-écrasera plus jamais mot de passe / clés au boot)
sudo touch /etc/cloud/cloud-init.disabled

# 3) (Re)poser le mot de passe (il PERSISTERA désormais)
sudo passwd ubuntu

# 4) Ajouter une clé SSH en FILET (en plus du mot de passe). Clé publique du poste :
#    (sur ton poste : ssh-keygen -t ed25519  si tu n'en as pas, puis  cat ~/.ssh/id_ed25519.pub)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'COLLE_TA_CLE_PUBLIQUE' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**5) Le test de sécurité — reboot (applique aussi un éventuel noyau en attente) puis reconnexion :**
```bash
sudo reboot
# attendre ~2-3 min, puis depuis le poste :
ssh-keygen -R <IP_DU_VPS>     # purge d'éventuelles vieilles clés d'hôte (rescue)
ssh ubuntu@<IP_DU_VPS>        # doit se reconnecter par mot de passe ET/OU clé
```

✅ Si la reconnexion passe **après ce reboot**, l'accès est blindé : cloud-init ne peut plus
verrouiller le compte. Sinon, **restaurer le snapshot** (0.A) et recommencer.

> Réactiver cloud-init un jour : `sudo rm /etc/cloud/cloud-init.disabled`. Lors d'une future
> **réinstallation propre** du VPS, on configurera l'accès (mot de passe + clé) **dès le
> provisionnement** — ce piège est spécifique à cette image déjà installée.

---

# Étape 1 — Installer Docker (si l'inventaire 0.C l'a montré absent)

Si `docker` / `docker compose` étaient présents dans l'inventaire, **saute cette étape**. Sinon,
installe **Docker Engine + plugin compose** depuis le dépôt **officiel** Docker (Ubuntu) :

```bash
# sur le VPS — Docker Engine + plugin compose (dépôt officiel)
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# (optionnel) lancer docker sans sudo — se déconnecter/reconnecter ensuite pour appliquer
sudo usermod -aG docker "$USER"

docker version && docker compose version
```

> N'installe **rien d'autre** sur l'hôte : le but est un hôte **propre**. Tout le reste (Caddy, apps)
> tourne en conteneurs.

---

# Étape 2 — Déployer `apps/_template` en mode VALIDATION (Traccar intact)

But : Caddy sur **8080/8443** (nginx garde 80/443) + le conteneur `template`. **Rien ne touche
Traccar.**

### 2.1 — Récupérer l'infra (le repo) sur le VPS

```bash
# sur le VPS
sudo mkdir -p /opt/locomotionlab && sudo chown "$USER":"$USER" /opt/locomotionlab
git clone git@github.com:thelocomotionlab/thelocomotionlab-website.git /opt/locomotionlab
cd /opt/locomotionlab
git checkout claude/cool-turing-0nkgcx    # la branche qui porte l'infra (sinon `main` une fois mergé)
cd infra
```

### 2.2 — S'assurer que l'image GHCR existe

L'image `template` est construite par la CI (cf. `.github/workflows/deploy-vps.yml`). Déclenche-la une
fois (onglet **Actions → deploy-vps → Run workflow**, sur la branche voulue), ou pousse sur `main`.
Puis rends le **package GHCR lisible** par le VPS :

- **Le plus simple** : GitHub → repo → **Packages** → `template` → **Package settings** → *Change
  visibility* → **Public** (l'image ne contient aucun secret).
- **Ou** garde-la privée et connecte-toi avant de déployer :
  `export GHCR_USER=<toi> GHCR_TOKEN=<PAT read:packages>` (le `deploy.sh` fera le `docker login`).

### 2.3 — Configurer `.env` (secrets hors-repo) et déployer

```bash
# sur le VPS, dans /opt/locomotionlab/infra
cp .env.example .env
nano .env       # renseigne CF_API_TOKEN + ACME_EMAIL ; laisse HTTP_PORT=8080 / HTTPS_PORT=8443
                # (CF_API_TOKEN = token DNS-01, cf. docs/cloudflare-vps.md §1)

# Ouvre le port 8443 entrant (pour que Cloudflare joigne l'origine). Si ufw est actif :
sudo ufw allow 8443/tcp
# NB : si un pare-feu OVH (Manager) est actif, autorise aussi 8443 là-bas.

./deploy.sh
docker compose ps
docker compose logs caddy --tail=30   # tu dois voir l'obtention du certificat pour template.*
```

### 2.4 — Vérifs locales (sur le VPS, sans Cloudflare)

```bash
# Le certificat est émis par Let's Encrypt et le template répond via Caddy :
curl --resolve template.thelocomotionlab.com:8443:127.0.0.1 \
     https://template.thelocomotionlab.com:8443/ | head

# Contrôle que Traccar est INTACT (toujours servi par nginx sur 443) :
curl -I https://tracking.thelocomotionlab.com
```

---

# Étape 3 — Cloudflare devant + validation HTTPS externe

Applique [`docs/cloudflare-vps.md`](./cloudflare-vps.md) (réglages **dashboard**) : token DNS-01 (§1),
DNS `template` proxifié (§2), TLS **Full (strict)** (§3), **blocage IA/bots OFF** (§4), **Origin Rule
port → 8443** (§5).

Puis valide **de l'extérieur** :

```bash
# depuis ta machine (ou le VPS)
curl -I https://template.thelocomotionlab.com
#   → HTTP/2 200 + en-tête « server: cloudflare » = chaîne complète OK
#     (edge Cloudflare 443 → origine VPS 8443 → Caddy → conteneur template)

# Traccar fonctionne TOUJOURS :
curl -I https://tracking.thelocomotionlab.com                 # UI répond comme avant
curl -s https://tracking.thelocomotionlab.com/api/public/server | head   # API publique (adapte l'endpoint)
```

✅ **Définition de terminé atteinte** : `apps/_template` est servi en **HTTPS derrière Cloudflare**
(toggle IA désactivé) et **Traccar fonctionne toujours** — on n'a pas touché 80/443.

---

# Étape 4 — Bascule de Traccar derrière Caddy ⚠️ IMPACT PROD — *gated*

> **Optionnelle / ultérieure.** À ne lancer que quand tu veux que Caddy serve aussi Traccar (80/443).
> Jusque-là, tout ce qui précède laisse Traccar **intact**.

### 4.0 — Pré-requis NON négociables

- [ ] **0.A** snapshot OVH **fait** et actif.
- [ ] **0.B** sauvegarde Traccar **faite** (archive vérifiée).
- [ ] La route Traccar est **finalisée** d'après ton `nginx -T` complet (UI, `/api/public/*` + Bearer,
      CORS + préflight 204, `Set-Cookie`/`WWW-Authenticate` masqués, les **3 `live-*.json`**, CSP) dans
      `infra/caddy/conf.d/tracking.caddy.disabled`. ✅ **Fait** — reste à l'activer (renommer en
      `tracking.caddy`) et à `git pull` sur le VPS.
- [ ] **Nouveau token Traccar** régénéré (l'ancien a fuité) et placé dans `infra/.env`
      (`TRACCAR_API_TOKEN=…`). Jamais dans le repo.
- [ ] Fenêtre calme choisie (courte coupure possible de l'UI/API tracking pendant le `up`).

> **La chaîne live-tracking reste sur l'hôte.** `live-cache.mjs` + `live-cache.timer` + tes scripts
> `~/live-tracking/` continuent de tourner et d'écrire `/opt/traccar/live-*.json` **inchangés**.
> Caddy ne fait que **servir** ces fichiers (montés en lecture seule). On ne touche pas à cette chaîne
> ici (le refactor éventuel est pour une autre session).

> **Validation préalable conseillée (sans coupure)** : avant de flipper 443, on peut tester le bloc
> Traccar de Caddy sur un sous-domaine de *staging* (p. ex. `tracking-staging`, DNS proxifié + Origin
> Rule → 8443, route Caddy pointant le même `:8082`) et comparer les réponses `/` et `/api/public/...`
> à la prod. Demande-moi cette variante si tu veux la jouer.

### 4.1 — Activer la route Traccar et passer Caddy en 80/443

L'activation se fait **par un commit** (pas d'édition à la main sur le serveur) : je renomme
`conf.d/tracking.caddy.disabled` → `conf.d/tracking.caddy` et je décommente le montage `/opt/traccar`
dans `infra/compose.yml`. Côté VPS, tu n'as qu'à `git pull` puis régler `.env` :

```bash
# sur le VPS, dans /opt/locomotionlab
git pull                          # récupère tracking.caddy activé + le montage /opt/traccar
cd infra
nano .env                         # renseigne le NOUVEAU TRACCAR_API_TOKEN ; passe HTTP_PORT=80 / HTTPS_PORT=443
```

> Le montage `- /opt/traccar:/srv/traccar:ro` (dans `compose.yml`) donne à Caddy un accès **lecture
> seule** aux `live-*.json`. Il expose aussi le reste de `/opt/traccar` (base H2, `live-cache.config.json`)
> en RO au conteneur : Caddy ne sert QUE les 3 routes `live-*.json` déclarées, mais un futur refactor
> gagnerait à déplacer ces JSON dans un sous-dossier dédié (p. ex. `/opt/traccar/public/`).

### 4.2 — Libérer 80/443 de nginx, puis (re)lancer Caddy

```bash
# Libère les ports (réversible : la conf nginx n'est PAS supprimée, juste le service arrêté)
sudo systemctl stop nginx
sudo systemctl disable nginx      # évite qu'il reprenne 443 au reboot pendant qu'on teste

cd /opt/locomotionlab/infra
./deploy.sh                       # Caddy prend 80/443 et sert template + tracking
docker compose logs caddy --tail=40
```

### 4.3 — Cloudflare : retirer l'Origin Rule 8443

Supprime la règle de [`docs/cloudflare-vps.md`](./cloudflare-vps.md) §5 (template repasse en 443
standard). Referme 8443 si tu veux : `sudo ufw delete allow 8443/tcp`.

### 4.4 — Vérifications

```bash
curl -I https://template.thelocomotionlab.com                          # toujours OK (443 standard)
curl -I https://tracking.thelocomotionlab.com                          # UI Traccar via Caddy
curl -s https://tracking.thelocomotionlab.com/api/public/server | head  # API publique + token injecté
# Les 3 fichiers live-tracking (servis depuis /opt/traccar, comme avant) :
curl -s https://tracking.thelocomotionlab.com/live-positions.json | head
curl -s https://tracking.thelocomotionlab.com/live-stats.json | head
curl -s https://tracking.thelocomotionlab.com/live-timer.json | head
# Et la page qui les consomme : https://www.thelocomotionlab.com (carte live) doit s'afficher.
```

> Les **ports « device » de Traccar** ne passent **pas** par le proxy : d'après ton inventaire, seul
> **5055/tcp** (protocole OsmAnd) est ouvert au pare-feu pour les balises ; les autres ports `5xxx`
> écoutent mais sont filtrés. La bascule ne concerne que le **web (443)** ; 5055 reste direct, inchangé.

### 4.5 — ROLLBACK (si quoi que ce soit cloche)

```bash
# 1) Rendre 80/443 à nginx (retour à l'état d'avant bascule)
cd /opt/locomotionlab/infra
docker compose down
sudo systemctl enable --now nginx
systemctl status nginx --no-pager
# 2) (si besoin) relancer Caddy en mode validation : remets HTTP_PORT=8080 / HTTPS_PORT=8443 dans .env
#    puis ./deploy.sh, et rétablis l'Origin Rule 8443 côté Cloudflare.
```

Filet ultime : **restaurer le snapshot OVH** (0.A) ou la **sauvegarde Traccar** (0.B).

---

## Annexe — Mises à jour quotidiennes (après la mise en place)

```bash
# Déployer une nouvelle version d'app (image déjà poussée sur GHCR par la CI) :
cd /opt/locomotionlab && git pull && cd infra && ./deploy.sh

# Voir l'état / les logs :
docker compose ps
docker compose logs -f caddy
```

Pour **épingler / rollback** une version d'app : mets `TEMPLATE_IMAGE=ghcr.io/thelocomotionlab/template:sha-XXXXXXX`
dans `.env` puis `./deploy.sh`.
