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

| Étape | But | Risque | Statut dans ce runbook |
| --- | --- | --- | --- |
| **0** | Réversibilité : snapshot OVH + sauvegarde Traccar + **inventaire** | nul (lecture/backup) | **détaillée ci-dessous** |
| 1 | Installer Docker (si absent) | faible | rédigée après ton inventaire |
| 2 | Déployer `apps/_template` en **mode validation** (ports 8080/8443) | nul pour Traccar | rédigée après l'infra |
| 3 | Cloudflare devant + validation HTTPS externe | nul pour Traccar | rédigée après l'infra |
| 4 | **Bascule Traccar** derrière Caddy (80/443) | **IMPACT PROD** — *gated* | rédigée après ton `nginx -T` |

> Les étapes 1→4 référencent des fichiers de `infra/` ; elles sont complétées dans ce même document
> une fois `infra/` en place. **Commence par l'étape 0** : elle est autonome et te permet de me
> renvoyer l'inventaire dont dépend la suite.

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

## Étapes 1 → 4

> 🚧 Rédigées dans ce même document une fois `infra/` en place et **ton inventaire (0.C) reçu**. Elles
> couvriront : **(1)** installation de Docker si nécessaire, **(2)** déploiement de `apps/_template` en
> mode validation (Caddy sur 8080/8443, HTTPS via Let's Encrypt DNS-01, **Traccar intact**),
> **(3)** mise en place de Cloudflare devant + validation HTTPS externe, **(4)** **bascule Traccar**
> derrière Caddy (étape *gated*, avec rollback).
>
> **Garde-fou** : aucune commande des étapes 1→4 ne touche la prod Traccar tant que (0.A) snapshot et
> (0.B) sauvegarde ne sont pas faits. La bascule (4) n'est figée qu'après réception de ton `nginx -T`.
