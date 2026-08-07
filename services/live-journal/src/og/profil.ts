// La silhouette altimétrique des cartes de partage, version FOND SOMBRE :
// la portion parcourue est une aire ambrée pleine, la portion restante un
// simple filet clair, et un trait vertical pointillé marque l'avancement.
// Même géométrie que le profil de /live (1000×180), rendue en SVG data URI —
// satori ne sait pas dessiner, il sait afficher une image.

const AMBRE = "#EFB159";
const AMBRE_SOMBRE = "#D89A3D";
const CLAIR = "rgba(254,251,246,0.62)";

export interface ProfilPoint {
  km: number;
  alt: number;
}

export interface ProfilOptions {
  /** Kilomètre atteint sur l'itinéraire (0 = rien de parcouru). */
  doneKm: number;
  totalKm: number;
  /** Trait vertical à l'avancement (inutile quand tout est parcouru). */
  curseur?: boolean;
}

const W = 1000;
const H = 180;
const TOP = 10;
const BASE = 158;

export function profilDataUri(profile: ProfilPoint[], options: ProfilOptions): string | null {
  const points = profile.filter((p) => Number.isFinite(p?.km) && Number.isFinite(p?.alt));
  if (points.length < 2) return null;
  const totalKm = options.totalKm > 0 ? options.totalKm : points[points.length - 1].km;
  if (!(totalKm > 0)) return null;

  const alts = points.map((p) => p.alt);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  const x = (km: number) => ((Math.max(0, Math.min(totalKm, km)) / totalKm) * W).toFixed(1);
  const y = (alt: number) => (TOP + (1 - (alt - min) / Math.max(1, max - min)) * (BASE - TOP)).toFixed(1);

  const doneKm = Math.max(0, Math.min(totalKm, options.doneKm));
  const tous = points.map((p) => `${x(p.km)} ${y(p.alt)}`);
  const parcourus = points.filter((p) => p.km <= doneKm);

  const parts: string[] = [];

  // Le relief restant : filet clair, jamais rempli — il n'est pas encore acquis.
  parts.push(
    `<path d="M ${tous.join(" L ")}" fill="none" stroke="${CLAIR}" stroke-width="2.5" stroke-linejoin="round"/>`,
  );

  if (parcourus.length > 1) {
    const cov = parcourus.map((p) => `${x(p.km)} ${y(p.alt)}`);
    const finX = x(parcourus[parcourus.length - 1].km);
    parts.push(
      `<path d="M 0 ${BASE} L ${cov.join(" L ")} L ${finX} ${BASE} Z" fill="${AMBRE}" fill-opacity="0.85"/>`,
      `<path d="M ${cov.join(" L ")}" fill="none" stroke="${AMBRE_SOMBRE}" stroke-width="2.5" stroke-linejoin="round"/>`,
    );
    if (options.curseur !== false && doneKm < totalKm) {
      parts.push(
        `<line x1="${finX}" y1="${TOP - 6}" x2="${finX}" y2="${BASE}" stroke="${AMBRE}" stroke-width="3" stroke-dasharray="7 7"/>`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${parts.join("")}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
