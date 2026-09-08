// lib/site.mjs
//
// L'ADRESSE DU SITE, dans un module que Node charge tel quel.
//
// Elle est lue des deux côtés : par l'application (lib/seo.js, d'où partent
// les canoniques, le plan de site et les URL de partage) et par
// next.config.mjs, qui s'exécute hors du bundle et ne peut pas importer un
// module de l'app.

/** L'hôte officiel : tout ce qui doit être absolu en part. */
export const SITE_HOST = "www.thelocomotionlab.com";

/**
 * L'hôte qui sert le même déploiement et doit rediriger vers l'officiel.
 * Une page à deux adresses est une page que les moteurs comptent deux fois.
 */
export const SITE_HOST_ALIAS = "thelocomotionlab.com";

export const SITE_URL = `https://${SITE_HOST}`;
