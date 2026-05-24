// lib/readingTime.js
//
// Estimation du temps de lecture en minutes à partir d'un contenu Markdown.
// Base : 200 mots/minute (vitesse moyenne lecture FR).
// Le markdown brut (titres, syntaxe ::: split, citations, etc.) est nettoyé
// avant comptage pour ne pas surestimer.

const WORDS_PER_MINUTE = 200;

export function estimateReadingMinutes(markdown) {
  if (!markdown || typeof markdown !== "string") return 0;

  const cleaned = markdown
    // blocs code
    .replace(/```[\s\S]*?```/g, " ")
    // images, liens, syntaxe markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    // directives ::: split etc.
    .replace(/^:::.*$/gm, " ")
    // citations {{cite:xxx}}, refs {{fig:xxx}}
    .replace(/\{\{[^}]+\}\}/g, " ")
    // balises HTML
    .replace(/<[^>]+>/g, " ")
    // ponctuation excessive / symboles markdown
    .replace(/[#*_>`~]/g, " ");

  const words = cleaned.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return Math.max(1, Math.round(words.length / WORDS_PER_MINUTE));
}
