# Brief — Chantier 2 : le direct des Écrins (live-tracking v2)

> **Lecteur : Claude Code**, exécuté à la racine du monorepo `thelocomotionlab-website`.
> Ce brief complète `CLAUDE.md` (lu automatiquement) : conventions et garde-fous s'appliquent intégralement.
> **Base de travail : la branche du chantier 1** (`claude/thelocomotionlab-reorganization-zbte6u` ou son successeur — vérifier si `main` a été mise à jour entre-temps). Ce chantier dépend de ses acquis : page `/live` à deux états, `lib/liveConfig.js`, `EmailCapture`, `docs/live-archive-schema.md`, `services/email-gateway`.
> **Référence visuelle : `docs/design/live-v2/`** (HTML + screenshots, committés par Valentin — prérequis §10). **Le design HTML fait foi** : en cas d'écart technique nécessaire, le signaler avant d'implémenter différemment.
> **Autorité finale : Valentin.** Ce brief décrit l'intention ; la réalité du code et son regard priment.

---

## 0. Règles de travail (à lire avant toute action)

1. **Une PR à la fois, dans l'ordre (PR1 → PR5).** Branches empilées sur la base ci-dessus : `live/pr1-journal-service`, `live/pr2-encours`, `live/pr3-avant-termine`, `live/pr4-partage`, `live/pr5-runbook`.
2. **Mode plan obligatoire** au début de chaque PR : plan détaillé (fichiers, schémas de données, choix techniques) → **validation de Valentin** avant le code.
3. **Deux points d'arrêt par PR** : après le plan, puis après l'implémentation (résumé des diffs + checklist de recette, avec le simulateur quand il existe).
4. **Le site reste déployable à chaque merge de PR** ; Cloudflare Pages fournit une préversion par branche — la recette s'y fait sans rien publier.
5. **Vérifications avant de présenter** : `pnpm -F site build` + `pnpm -F site lint` + build `@cloudflare/next-on-pages` ; pour le service : typecheck strict, tests, `docker build`.
6. **VPS = infra as code** : tout changement serveur passe par `infra/` (compose, Caddy, scripts). **Jamais d'édition manuelle du VPS** ; toute opération serveur est présentée et validée avant exécution.
7. **Aucun secret dans le repo** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `VALENTIN_CHAT_ID`… : env/secrets uniquement, cf. `docs/secrets.md`).
8. **Aucune suppression de fichier.** Pas de merge vers `main` sans décision explicite de Valentin.
9. **Vie privée** : le contenu des messages privés des visiteurs n'est **jamais stocké** côté serveur (transmission directe, logs = compteurs anonymes). Les messages privés sont **exclus** de toute archive publique.
10. En cas d'ambiguïté : **poser la question**, ne pas inventer.

---

## 1. Contexte et objectif

Du 20 au 24 août 2026, Valentin boucle le **Tour des Écrins en autonomie** (194 km · ~12 000 m D+). Un tracker **Queclink GL320M** émet vers le serveur **Traccar** existant (VPS, conteneurisé), déjà consommé par `services/tracking-cache` et la carte live du site.

Objectif du chantier : faire de `/live` la page du **design validé** (trois états : Avant / En cours / Terminé) avec, par ordre de priorité — **le journal de bord est LA priorité** :

1. **Journal de bord** alimenté depuis le terrain par Telegram : texte, photo, **vocal** (l'élément signature — « vacation » radio d'expédition).
2. **Messages privés** des visiteurs vers Valentin (« Laisse un mot ») — pas de mur public.
3. **Cartes de partage dynamiques** (OG + story) qui montrent l'état vivant de l'aventure.
4. **Archivage pérenne** en fin d'aventure (contrat `docs/live-archive-schema.md` du chantier 1).

## 2. Décisions actées (périmètre)

**Inclus** : les trois états du design · journal texte + photo + vocal · messages privés automatisés (aucune modération humaine : rien n'est public) · indicateur de fraîcheur à deux régimes + cas « premier signal » · OG dynamique + carte story · export `archive.json` · **mode simulation** pour développer sans tracker.

**Derrière drapeau, défaut OFF** : vidéos courtes (≤ 20 Mo, limite de l'API Bot standard). Décision d'activation **après** le test 24 h.

**Exclus** : emails automatiques (deux envois **manuels** via Listmonk, avant et après l'aventure — hors code de ce chantier) · pronostic d'arrivée · Twin Live · mur public · thème nuit · serveur Bot API local (vidéos > 20 Mo) · campagne d'annonce. Options « si le test 24 h est vert » : §9 uniquement.

## 3. Architecture cible

```
GL320M ─▶ Traccar (VPS) ─▶ tracking-cache ─▶ positions + live-timer.json ─▶ page /live
Telegram (Valentin) ─▶ webhook ─▶ services/live-journal (VPS, NOUVEAU)
                                   ├─▶ journal.json + /media/*  ─▶ page /live (polling client)
                                   ├─▶ og.png / story.png régénérées ─▶ meta og:image
                                   └─◀ POST /message (visiteur) ─▶ bot ─▶ Telegram Valentin (privé)
Fin d'aventure ─▶ script export ─▶ archive.json ─▶ état « Terminé » (et futurs replays)
```

**Décisions techniques imposées ou recommandées** (tout écart argumenté au plan) :

- **Nouveau service `services/live-journal`** (Node/TS, conteneurisé, route Caddy — proposer domaine/chemin au plan). `tracking-cache` n'est pas modifié au-delà du strict nécessaire.
- **Webhook Telegram** sécurisé par `secret_token` ; gestion de `edited_message` (correction d'une entrée depuis le terrain) et d'une **commande de suppression** simple (répondre `/supprimer` à sa propre entrée). Précieux avec des doigts gelés.
- **Médias** : photos compressées côté serveur (sharp, largeur max ~1600 px, EXIF retiré), audio **transcodé AAC/M4A** (lecture universelle iOS/Android), fichier source conservé, noms de fichiers non devinables, en-têtes de cache longs sur `/media/*`, courts sur `journal.json`.
- **`journal.json`** : append-only, ids stables, entrées `{id, ts, type: text|photo|audio|video, text?, media?{url, duration?, width?, height?}}`, jour (« J1, J2… ») et heures calculés en **Europe/Paris** depuis la date de départ de `liveConfig`. Schéma détaillé à proposer au plan, cohérent avec le contrat d'archive.
- **Messages privés** : `POST /message` (message, prénom facultatif, email facultatif) → `sendMessage` vers `VALENTIN_CHAT_ID`. Garde-fous : honeypot, limite de débit par IP, longueur max, CORS restreint au site. **Aucun stockage du contenu.**
- **OG dynamique générée côté VPS** (satori ou canvas), régénérée toutes les 2–5 min vers une URL stable + cache-buster dans la meta. **Pas de route edge Cloudflare** : le site reste 100 % statique.
- Le front consomme `journal.json` en **polling client** (même pattern que les positions), intervalle dans `liveConfig`.
- **Tout paramètre d'aventure vit dans `apps/site/lib/liveConfig.js`** : dates et heure de départ, distance/D+, GPX prévisionnel, waypoints du profil, seuil « zone blanche », endpoints, drapeau vidéo.

---

## 4. PR1 — Le service `live-journal` + le simulateur

- Service complet : webhook (texte/photo/vocal ; vidéo ingérée mais servie seulement si drapeau ON), traitement médias, `journal.json`, `/media/*`, `POST /message`, healthcheck.
- `infra/` : conteneur (version épinglée), volume médias, route Caddy, variables d'env documentées ; section sauvegarde du volume dans le README d'infra.
- **Mode simulation** (env flag) : rejoue un GPX à vitesse accélérée vers le format de positions attendu par le front **et** publie un journal scripté (texte, photo factice, un vrai fichier audio court) — c'est l'outil de développement des PR suivantes et de la recette.
- Tests : unités sur l'ingestion et les garde-fous du `POST /message` ; run local documenté.

**Recette PR1** : depuis un bot de test, envoyer texte → photo → vocal → correction (`edited_message`) → `/supprimer` : `journal.json` reflète chaque étape ; un `POST /message` arrive sur le Telegram de Valentin ; le simulateur produit positions + journal exploitables en local.

## 5. PR2 — `/live`, état « En cours » conforme au design

- Journal : les **trois types d'entrées** du design. Lecteur audio « **une prise, pas de scrubbing** » : lecture/pause + temps écoulé/durée seulement, **reprise robuste** en cas de coupure réseau (pas de scrubbing visible ≠ pas de robustesse de lecture). Variante vidéo derrière drapeau.
- Module « Laisse un mot à Valentin » : états repos / envoi / **confirmation** (« Remis. Il le lira ce soir au bivouac. ») / erreur ; mention de confidentialité exacte du design.
- **Fraîcheur à deux régimes** : « Dernière position il y a X min » ; au-delà du seuil (`liveConfig`, défaut 60 min) → « Zone blanche probable — dernière position il y a X h », stylée information de terrain (sauge), jamais alerte. **Cas T0** : « En attente du premier signal » entre l'heure de départ et la première position.
- Desktop deux colonnes (`1fr 460px`), mobile prioritaire.
- **Règles de rendu** : ambre et sauge réservés aux pastilles/badges/graphiques — **jamais de texte < 16 px** dans ces couleurs (lisibilité plein soleil) ; trace simplifiée (Douglas-Peucker) avant affichage ; photos en lazy-load ; budget : premier chargement **< 1,5 Mo hors tuiles**.

**Recette PR2** (sur simulateur, préversion Cloudflare) : les trois types d'entrées s'affichent et se lisent sur iOS + Android ; un message privé part et se confirme ; les deux régimes de fraîcheur et le cas T0 s'observent en manipulant le simulateur ; budget poids mesuré.

## 6. PR3 — États « Avant » et « Terminé » + archive

- **Avant** : hero (« Prochain départ… », valeurs depuis `liveConfig`), intention en Lora, carte de l'itinéraire prévisionnel + profil altimétrique avec waypoints (GPX et liste fournis par Valentin — placeholder propre tant qu'absents), capture email `source="live"` avec la micro-promesse exacte.
- **Terminé** : bandeau de clôture, stats finales, journal complet consultable, « Récit à paraître », capture « être prévenu·e du récit ».
- **Export** : script `export-archive` (positions via l'API Traccar + `journal.json` + stats → `archive.json` **conforme au contrat** `docs/live-archive-schema.md` ; champ `chat[]` laissé vide — les messages privés n'entrent **jamais** dans l'archive publique). L'état « Terminé » consomme `archive.json` : plus aucune dépendance à l'infra vivante après export.
- `liveConfig.js` étendu en conséquence (une aventure = un objet de config).

**Recette PR3** : bascule des trois états par la seule config ; export sur les données du simulateur → fichier valide → état Terminé rendu depuis l'archive seule (service coupé).

## 7. PR4 — Cartes de partage

- **OG 1200×630** : titre de l'aventure, progression, dernière étape franchie, badge EN DIRECT, silhouette du profil — reprendre la maquette du fichier « print » du design. Régénérée périodiquement côté service ; `og:image` de `/live` pointe dessus avec cache-buster. Variantes sobres pour les états Avant/Terminé.
- **Story 1080×1920** : même grammaire, contenu critique dans la **bande centrale** (zones de sécurité Instagram ≈ 250 px haut et bas) ; endpoint de génération à la demande + lien de téléchargement discret (usage manuel).

**Recette PR4** : un partage WhatsApp/Instagram du lien `/live` affiche l'état courant ; la story se télécharge et respecte les zones sûres.

## 8. PR5 — Répétition générale et exploitation

- **`docs/live-runbook-ecrins.md`** : checklist matériel GL320M (store & forward **activé**, intervalle 30–60 s — adaptatif si disponible, SIM M2M multi-opérateurs, tracker en haut du sac, autonomie réellement testée sur 24 h) ; checklist logicielle J-1 (webhook, healthcheck, espace disque, sauvegarde volume, envoi test) ; **procédure test 24 h** ; procédure de fin d'aventure (export, bascule Terminé) ; pannes probables et remèdes.
- **Auto-surveillance** : le service se contrôle et **prévient Valentin via le bot** si healthcheck KO — actif seulement hors aventure et à J-1 (pendant, personne n'agit : ne pas générer d'anxiété inutile).
- **Gel des fonctionnalités** après le test 24 h : seuls les correctifs passent.

**Recette finale (= définition de « fini » du chantier)** : un **dry-run de 24 h sans aucune intervention manuelle** — positions, un vocal publié depuis le terrain et lisible en < 2 min, un message privé reçu en < 30 s, OG à jour au partage, zone blanche simulée (tracker éteint 2 h) correctement affichée, export d'archive propre au retour.

## 9. Options — uniquement si le test 24 h est vert **et** qu'il reste du temps, dans cet ordre

1. Drapeau vidéo ON (après vérification du comportement en signal faible).
2. Météo automatique au point de chaque entrée du journal (Open-Meteo, enrichissement côté service).
3. Compteur de suiveurs approximatif (« N personnes suivent en ce moment »), sans aucun tracking individuel.

## 10. Prérequis Valentin (avant de lancer la PR1)

1. **Committer le design** : contenu du zip dans `docs/design/live-v2/` (les 3 HTML + `screenshots/`).
2. **BotFather** : créer le bot du journal, récupérer le token ; récupérer son `chat_id` ; poser les secrets sur le VPS selon `docs/secrets.md` (jamais dans le repo).
3. **Fournir le GPX prévisionnel** des Écrins + la liste des waypoints du profil (Sarenne, Lautaret, Arsine, Aup Martin, Vauze/Muzelle…) — sinon placeholders propres jusqu'à réception.
4. (Indépendant du chantier) Câblage Listmonk/Brevo selon `docs/email-setup.md` — nécessaire seulement pour l'envoi **manuel** de l'annonce, pas pour ce code.

## 11. Jalons conseillés

PR1–PR2 ≈ **19 juillet** · PR3–PR4 ≈ **26 juillet** · **test 24 h fin juillet** (sortie longue) · correctifs + PR5 **début août** · **gel le 10 août** · fenêtre de re-test 8–9 août si besoin · **départ le 20 août**.

## 12. Hors-scope strict (ne pas faire, même si tentant)

Emails automatiques et campagnes · pronostic d'arrivée · Twin Live · mur public · thème nuit · serveur Bot API local / vidéos > 20 Mo · retouches du design au-delà du HTML de référence · `apps/twin` et `services/twin-engine` · merge vers `main` (décision Valentin) · suppression de fichiers.

## 13. Démarrage

Commencer par la **PR1** : présenter le plan détaillé — nom et route du service, schéma `journal.json` complet, arborescence des médias, plan `infra/` (compose, Caddy, volumes, sauvegarde), stratégie du simulateur, matrice des cas Telegram (texte/photo/vocal/édition/suppression/inconnus) — puis **attendre la validation de Valentin** avant la première ligne de code.
