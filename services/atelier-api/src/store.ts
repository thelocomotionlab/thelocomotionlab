// Stockage des inscriptions : UN fichier JSON sur le volume (écriture atomique
// tmp + rename), chargé en mémoire au démarrage — pattern journal.json de
// live-journal. Volumétrie : quelques dizaines de lignes par atelier, un SGBD
// serait de la sur-ingénierie. Service mono-instance et Node mono-thread : la
// séquence « vérifier la capacité puis insérer » est synchrone, donc sans
// course possible.
//
// Données personnelles (prénom + email) : conservées le temps d'organiser
// l'atelier, purgées ensuite par la route admin DELETE (cf. README).

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
}

interface FileShape {
  version: 1;
  inscriptions: Inscription[];
}

export class InscriptionStore {
  private inscriptions: Inscription[] = [];
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

  add(atelierId: string, prenom: string, email: string, waitlist: boolean): Inscription {
    const inscription: Inscription = {
      id: crypto.randomBytes(6).toString("hex"),
      atelierId,
      prenom,
      email: email.toLowerCase(),
      waitlist,
      createdAt: this.now().toISOString(),
    };
    this.inscriptions.push(inscription);
    this.persist();
    return inscription;
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
    const payload: FileShape = { version: 1, inscriptions: this.inscriptions };
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
