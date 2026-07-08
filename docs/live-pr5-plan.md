# Plan PR5 — Répétition générale et exploitation (chantier 2, validé « fonce »)

> **Statut : validé d'avance par Valentin le 2026-07-08** (« Fonce sur PR5 »).
> Référence : brief §8. Consigné pour la trace avant implémentation.

## 1. Ce que la PR5 livre

1. **`docs/live-runbook-ecrins.md`** — LE document d'exploitation, autoportant
   (imprimable) : mise en service initiale (DNS, secrets, déploiement, webhook),
   checklist matériel GL320M (store & forward, intervalle, SIM M2M, position
   dans le sac, autonomie testée), checklist logicielle J-1, procédure du test
   24 h (= recette finale du chantier), jour J, fin d'aventure (export → bascule
   Terminé), pannes probables et remèdes, règle de gel.
2. **Auto-surveillance** (module `selfcheck` du service) : le service vérifie
   périodiquement sa propre chaîne — espace disque, volume inscriptible,
   webhook Telegram (getWebhookInfo : erreurs récentes, updates en attente),
   site et tracking joignables, fraîcheur de og.png — et **prévient Valentin
   via le bot** en cas de problème. **Active UNIQUEMENT hors aventure**
   (`live-timer.running === false`, donc active à J-1, silencieuse pendant —
   personne n'agit, on ne génère pas d'anxiété). Anti-spam : notification à la
   bascule ok→KO, rappel au plus toutes les 6 h, message de rétablissement.
3. Marquage « document historique » sur les docs d'infra périmées (le
   nettoyage DESTRUCTIF de docs/ attend la validation de la liste par Valentin).

## 2. Détails techniques du selfcheck

- Config non secrète : `selfCheck: { enabled: true, intervalMinutes: 30,
  diskMinMb: 500 }` (surchargeable par env `SELF_CHECK_*`). Horloge, fetch,
  mesure disque et Telegram injectables → tests hermétiques.
- Vérifications : ① disque libre sur DATA_DIR (`fs.statfs`) ; ② écriture test
  dans private/tmp ; ③ `GET {trackingBase}/live-timer.json` ; ④ `GET
  {siteBase}/live-config.json` ; ⑤ mode webhook : `getWebhookInfo` (URL posée,
  pas d'erreur < 30 min, `pending_update_count` < 50) ; ⑥ OG activé :
  `lastGeneratedAt` non nul.
- `healthz` expose l'état du selfcheck (PR5 boucle la boucle : le healthcheck
  compose reste le signal docker, le selfcheck est le signal HUMAIN).

## 3. Recette PR5

Tests unitaires du selfcheck (transitions ok→KO→ok, anti-spam 6 h, silence
pendant l'aventure) ; suite complète + lint + build + next-on-pages verts ;
runbook relu contre l'état réel du repo (chaque commande vérifiée). La recette
FINALE du chantier (dry-run 24 h sans intervention) est une procédure terrain
du runbook §7 — exécutée par Valentin fin juillet, PAS dans cette PR.
