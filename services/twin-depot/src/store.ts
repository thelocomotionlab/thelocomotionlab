// Stockage des dépôts de la cohorte : les MÉTADONNÉES dans un fichier JSON
// (écriture atomique tmp + rename, chargé en mémoire — pattern atelier-api),
// l'ARCHIVE elle-même dans archives/<id>/<nomFichier> sur le même volume.
// Volumétrie : quelques dizaines de dépôts, chacun de plusieurs centaines de
// Mo — l'archive ne passe JAMAIS par la mémoire (streaming côté serveur vers
// un fichier temporaire du volume, puis rename atomique ici).
//
// Cycle de vie d'une archive (règle du labo, CLAUDE.md § Données utilisateur) :
// déposée → analysée par Valentin (téléchargement admin) → PURGÉE (route
// admin DELETE). Le volume ne garde rien d'autre.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface Depot {
  id: string;
  /** Référence de dossier (LL-TWIN-<année>-<seq>). */
  reference: string;
  prenom: string;
  nom: string;
  /** Normalisé en minuscules. */
  email: string;
  /** Id de marque (garmin, polar…) — validé contre config.montres. */
  montre: string;
  objectifs: string;
  /**
   * Objectif chiffré, tel que TAPÉ par l'athlète (« 31h », « 31:00:00 »… ou "" si non
   * renseigné). Le texte libre `objectifs` reste à côté : il porte le récit, celui-ci
   * porte le nombre.
   */
  objectifCible: string;
  /**
   * Le même objectif en HEURES décimales (null si non renseigné). C'est ce que consomme
   * le moteur (`--target`, mode objectif, ADR 0002) : on parse à la saisie plutôt que de
   * relire de la prose au moment de l'analyse.
   */
  objectifHeures: number | null;
  /** Preuve du consentement coché (texte affiché versionné côté site). */
  consent: boolean;
  /** Nom de fichier nettoyé, tel que stocké dans archives/<id>/. */
  nomFichier: string;
  /** Taille de l'archive en octets. */
  taille: number;
  /** Empreinte SHA-256 de l'archive (intégrité bout en bout). */
  sha256: string;
  createdAt: string;
  ip: string;
}

interface FileShape {
  version: 1;
  /** Compteur de références — persistant, jamais décrémenté (survit aux purges). */
  seq?: number;
  depots: Depot[];
}

/** Nettoie un nom de fichier client : dernier segment de chemin, caractères
 *  sûrs uniquement, jamais vide ni caché, borné en longueur. */
export function nettoyerNomFichier(nom: string): string {
  const base = nom.split(/[/\\]/).pop() ?? "";
  const sain = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "");
  const borne = sain.slice(0, 120);
  return borne || "archive.zip";
}

export class DepotStore {
  private depots: Depot[] = [];
  private seq = 0;
  private readonly file: string;
  private readonly archivesDir: string;

  constructor(
    dataDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = path.join(dataDir, "depots.json");
    this.archivesDir = path.join(dataDir, "archives");
    fs.mkdirSync(this.archivesDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as FileShape;
      this.depots = raw.depots ?? [];
      this.seq = raw.seq ?? this.depots.length;
    }
    this.purgerTemporaires();
  }

  /** Chemin d'un fichier temporaire d'upload, SUR LE VOLUME (même système de
   *  fichiers que archives/<id>/ → le rename final est atomique). */
  tmpPath(): string {
    return path.join(this.archivesDir, `tmp-${crypto.randomBytes(8).toString("hex")}`);
  }

  /** Fichiers tmp-* orphelins (uploads interrompus par un crash) : purgés au
   *  démarrage — un upload en cours n'existe jamais à cet instant. */
  private purgerTemporaires(): void {
    for (const nom of fs.readdirSync(this.archivesDir)) {
      if (nom.startsWith("tmp-")) {
        fs.rmSync(path.join(this.archivesDir, nom), { force: true });
      }
    }
  }

  list(): Depot[] {
    return [...this.depots];
  }

  find(id: string): Depot | undefined {
    return this.depots.find((d) => d.id === id);
  }

  count(): number {
    return this.depots.length;
  }

  archivePath(depot: Depot): string {
    return path.join(this.archivesDir, depot.id, depot.nomFichier);
  }

  /** Enregistre un dépôt : déplace le fichier temporaire streamé vers
   *  archives/<id>/<nomFichier> (rename atomique) puis persiste l'index. */
  add(
    meta: Omit<Depot, "id" | "reference" | "createdAt" | "email"> & { email: string },
    tmpFile: string,
  ): Depot {
    this.seq += 1;
    const depot: Depot = {
      ...meta,
      id: crypto.randomBytes(8).toString("hex"),
      reference: `LL-TWIN-${this.now().getFullYear()}-${String(this.seq).padStart(4, "0")}`,
      email: meta.email.toLowerCase(),
      createdAt: this.now().toISOString(),
    };
    const dir = path.join(this.archivesDir, depot.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(tmpFile, path.join(dir, depot.nomFichier));
    this.depots.push(depot);
    this.persist();
    return depot;
  }

  /** Purge d'un dépôt analysé : archive supprimée du disque + index. */
  remove(id: string): Depot | undefined {
    const depot = this.find(id);
    if (!depot) return undefined;
    fs.rmSync(path.join(this.archivesDir, depot.id), { recursive: true, force: true });
    this.depots = this.depots.filter((d) => d.id !== id);
    this.persist();
    return depot;
  }

  private persist(): void {
    const payload: FileShape = {
      version: 1,
      seq: this.seq,
      depots: this.depots,
    };
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
