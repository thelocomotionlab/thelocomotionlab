// lib/inscriptionContent.mjs
//
// SOURCE UNIQUE du contenu volatil de la page d'inscription aux ateliers
// (/pratiquer/inscription/[slug]) : consignes de sécurité et questions de
// santé. Ce contenu est AFFICHÉ par la page ET EMBARQUÉ dans le payload
// d'inscription — la fiche PDF (twin-engine) le boucle tel quel.
// → Modifier ICI suffit : la page et le PDF suivent, sans toucher au
//   template LaTeX ni aux services.

// Consignes de sécurité (bloc 3) — le verbe d'action en `titre`, le détail
// en `texte`. L'ordre d'affichage = l'ordre du tableau.
export const CONSIGNES = [
  {
    titre: "Échauffe-toi.",
    texte:
      "L'échauffement guidé en début de séance est obligatoire — on ne le saute pas, même en retard.",
  },
  {
    titre: "Retire-toi quand tu veux.",
    texte: "Renoncer à un mouvement est toujours une option valide, jamais un échec.",
  },
  {
    titre: "Vérifie le support avant toute suspension.",
    texte:
      "Descente contrôlée, 1 m maximum, parade obligatoire au-delà de 50 cm. Retire bagues et montres.",
  },
  {
    titre: "Amortis tes réceptions.",
    texte: "Genoux fléchis, réception amortie, 50 cm de hauteur maximum pour les sauts.",
  },
  {
    titre: "Prépare tes poignets.",
    texte: "Pas de quadrupédie sans les avoir échauffés.",
  },
  {
    titre: "Arrête-toi immédiatement",
    texte: "en cas de douleur aiguë. On ne « passe pas à travers ».",
  },
  {
    titre: "Assieds-toi et alerte",
    texte: "en cas de malaise ou de gêne respiratoire, même légère.",
  },
  {
    titre: "Reste visible.",
    texte: "On pratique dans le champ de vision de l'animateur, pas au-delà.",
  },
  {
    titre: "Vérifie ta trajectoire",
    texte: "avant de t'élancer : sol, obstacles, autres participants.",
  },
  {
    titre: "Prévois eau et tenue adaptée.",
    texte: "On est dehors, par (presque) tous les temps.",
  },
];

// Ligne supplémentaire affichée (et imprimée) quand un mineur participe.
export const CONSIGNES_MINEUR =
  "plafonds de hauteur réduits de moitié et parade systématique sur tous les franchissements.";

// Questions de santé (bloc 4) — LECTURE SEULE : les réponses ne sont ni
// collectées ni conservées ; seule l'attestation finale part dans le payload.
export const SANTE_QUESTIONS = [
  "Un membre de ta famille proche est-il décédé subitement avant 50 ans, d'une cause cardiaque ?",
  "As-tu déjà ressenti douleur thoracique, palpitations, essoufflement inhabituel ou malaise à l'effort ?",
  "As-tu eu une perte de connaissance ou des vertiges au cours des 12 derniers mois ?",
  "As-tu fait une crise d'asthme au cours des 12 derniers mois ?",
  "As-tu été hospitalisé·e ou opéré·e au cours des 12 derniers mois ?",
  "Suis-tu un traitement médical au long cours ?",
  "As-tu une douleur articulaire persistante qui limite certains mouvements ?",
  "As-tu une blessure non consolidée ?",
  "Es-tu enceinte ?",
  "As-tu arrêté toute activité physique depuis plus de six mois ?",
];

// Informations pratiques de l'écran de confirmation. `rendezVous` peut être
// précisé par atelier dans lib/ateliers.mjs (champ facultatif du même nom).
export const INFOS_PRATIQUES = {
  rendezVousDefaut:
    "Le point de rendez-vous exact te sera précisé par email avant la séance.",
  apporter:
    "De l'eau, une tenue souple qui ne craint pas la terre, une couche chaude pour la fin de séance. Pieds nus ou chaussures minimalistes bienvenus.",
  meteo:
    "On pratique sous pluie légère ; en cas de météo dangereuse, l'atelier est reporté et tu es prévenu·e par email.",
  contact: "contact@thelocomotionlab.com",
};

/** Le contenu tel qu'il part dans le payload d'inscription (et dans le PDF). */
export function contenuInscription() {
  return {
    consignes: CONSIGNES,
    consignesMineur: CONSIGNES_MINEUR,
    sante: SANTE_QUESTIONS,
  };
}
