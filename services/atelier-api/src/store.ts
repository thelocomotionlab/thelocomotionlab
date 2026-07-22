// Stockage des inscriptions : UN fichier JSON sur le volume (écriture atomique
// tmp + rename), chargé en mémoire au démarrage — pattern journal.json de
// live-journal. Volumétrie : quelques dizaines de lignes par atelier, un SGBD
// serait de la sur-ingénierie. Service mono-instance et Node mono-thread : la
// séquence « vérifier la capacité puis insérer » est synchrone, donc sans
// course possible.
//
// Une inscription complète porte sa FICHE (payload de rendu du PDF, preuve de
// consentement conservée 10 ans — cf. README § Données personnelles) et sa
// référence de dossier, tirée d'un compteur persistant jamais réutilisé.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface Inscription {
  id: string;
  atelierId: string;
  prenom: string;
  /** Normalisé en minuscules (clé de déduplication avec atelierId). */
  email: string;
  waitlist: boolean;
  createdAt: string;
  nom?: string;
  telephone?: string;
  /** Référence de dossier (LL-ATL-<année>-<seq>) des inscriptions complètes. */
  reference?: string;
  /** Empreinte SHA-256 des données soumises (celle portée par le PDF). */
  empreinte?: string;
  /** Payload de rendu de la fiche (copie fidèle de ce qui a été validé). */
  fiche?: Record<string, unknown>;
}

interface FileShape {
  version: 1;
  /** Compteur de références — persistant, jamais décrémenté (survit aux purges). */
  seq?: number;
  inscriptions: Inscription[];
}

export class InscriptionStore {
  private inscriptions: Inscription[] = [];
  private seq = 0;
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = path.join(dataDir, "inscriptions.json");
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as FileShape;
      this.inscriptions = raw.inscriptions ?? [];
      this.seq = raw.seq ?? this.inscriptions.length;
    }
  }

  /** Inscrits confirmés (hors liste d'attente) d'un atelier. */
  registered(atelierId: string): number {
    return this.inscriptions.filter((i) => i.atelierId === atelierId && !i.waitlist).length;
  }

  /** Personnes en liste d'attente d'un atelier. */
  waitlisted(atelierId: string): number {
    return this.inscriptions.filter((i) => i.atelierId === atelierId && i.waitlist).length;
  }

  find(atelierId: string, email: string): Inscription | undefined {
    const lc = email.toLowerCase();
    return this.inscriptions.find((i) => i.atelierId === atelierId && i.email === lc);
  }

  list(atelierId?: string): Inscription[] {
    return atelierId
      ? this.inscriptions.filter((i) => i.atelierId === atelierId)
      : [...this.inscriptions];
  }

  count(): number {
    return this.inscriptions.length;
  }

  /** Référence de dossier suivante — compteur incrémenté et persisté aussitôt. */
  nextReference(): string {
    this.seq += 1;
    this.persist();
    const annee = this.now().getFullYear();
    return `LL-ATL-${annee}-${String(this.seq).padStart(4, "0")}`;
  }

  add(
    atelierId: string,
    prenom: string,
    email: string,
    waitlist: boolean,
    extra: Partial<Inscription> = {},
  ): Inscription {
    const inscription: Inscription = {
      id: crypto.randomBytes(6).toString("hex"),
      atelierId,
      prenom,
      email: email.toLowerCase(),
      waitlist,
      createdAt: this.now().toISOString(),
      ...extra,
    };
    this.inscriptions.push(inscription);
    this.persist();
    return inscription;
  }

  /** Retrait d'UNE inscription (désistement individuel) — la place se libère,
   *  le compteur de /places se recalcule seul. Retourne l'inscription, ou null. */
  remove(id: string): Inscription | null {
    const idx = this.inscriptions.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const [removed] = this.inscriptions.splice(idx, 1);
    this.persist();
    return removed;
  }

  /** Purge d'un atelier terminé (données perso). Retourne le nombre supprimé. */
  purge(atelierId: string): number {
    const before = this.inscriptions.length;
    this.inscriptions = this.inscriptions.filter((i) => i.atelierId !== atelierId);
    const removed = before - this.inscriptions.length;
    if (removed) this.persist();
    return removed;
  }

  private persist(): void {
    const payload: FileShape = {
      version: 1,
      seq: this.seq,
      inscriptions: this.inscriptions,
    };
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
