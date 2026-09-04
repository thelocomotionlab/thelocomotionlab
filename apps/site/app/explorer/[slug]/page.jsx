// app/explorer/[slug]/page.jsx
//
// Détail unifié du pilier Explorer : expéditions, protocoles, carnets et
// fiches vivent dans le même espace de noms. Le corps de rendu vient de la
// table KINDS (`corps`) — ArticleBody pour un texte suivi, ProjetBody pour ce
// qui a un sommaire, des replays, des plots et des paquetages.
export const dynamicParams = false;

import { notFound } from "next/navigation";

import ArticleBody from "@/components/ArticleBody";
import ProjetBody from "@/components/ProjetBody";
import Breadcrumb from "@/components/Breadcrumb";
import SearchHighlighter from "@/components/SearchHighlighter";
import { getRelated } from "@/lib/getRelated";
import {
  listByPilier,
  findExplorerEntry,
  assertContentRules,
  etatDe,
} from "@/lib/contentRoutes.mjs";

import { imageDePartage, LOGO_SIZE, LOGO_URL } from "@/lib/seo";

const SITE_URL = "https://thelocomotionlab.com";

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoString(value) {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Lit un atome d'Explorer à partir de son slug.
 * Retourne { entry, item, content } ou null (→ 404).
 */
function readExplorerEntry(slug) {
  const entry = findExplorerEntry(slug);
  if (!entry) return null;

  const { data, content } = entry;

  return {
    entry,
    content,
    item: {
      slug,
      kind: entry.kind,
      kindLabel: entry.label,
      etat: etatDe(entry),
      title: data.title || slug,
      description: data.description || "",
      cover: data.cover || "",
      tags: data.tags || [],
      author: data.author || "",
      date: toDate(data.date),
    },
  };
}

// Génération statique : tous les atomes d'Explorer, brouillons compris. Les
// brouillons sont pré-rendus en 404 (readExplorerEntry les refuse) : sous
// @cloudflare/next-on-pages, une route [slug] sans AUCUN chemin pré-rendu
// serait traitée comme dynamique et exigerait le runtime edge.
export async function generateStaticParams() {
  assertContentRules();
  return listByPilier("explorer").map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;

  const data = readExplorerEntry(slug);

  if (!data) {
    return {
      title: "Page introuvable – The Locomotion Lab",
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const { item } = data;

  const url = `${SITE_URL}/explorer/${item.slug}`;
  const ogImage = imageDePartage(item.cover);

  const description =
    item.description ||
    "Explorer : le terrain du Locomotion Lab — expéditions en autonomie, protocoles N = 1, carnets de bord et fiches de matériel.";

  const publishedTime = toIsoString(item.date);

  return {
    title: item.title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: item.title,
      description,
      url,
      type: "article",
      locale: "fr_FR",
      images: [{ url: ogImage }],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: item.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ExplorerEntryPage({ params }) {
  const { slug } = await params;

  const data = readExplorerEntry(slug);

  if (!data) {
    notFound();
  }

  const { entry, item, content } = data;
  const jsonLd = buildJsonLd(item);
  const related = getRelated("explorer", slug, 3);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumb
        items={[
          { href: "/", label: "Accueil" },
          { href: "/explorer", label: "Explorer" },
          { label: item.title },
        ]}
      />
      {entry.corps === "article" ? (
        <ArticleBody
          article={item}
          initialContent={content}
          related={related}
          backHref="/explorer"
          backLabel="Retour à Explorer"
        />
      ) : (
        <ProjetBody project={item} initialContent={content} related={related} />
      )}
      <SearchHighlighter targetSelector=".article-body" />
    </>
  );
}

/**
 * JSON-LD d'un atome d'Explorer. Une expédition est un récit daté
 * (BlogPosting) ; un protocole, un carnet ou une fiche est un compte rendu de
 * longue haleine, mieux décrit par Article + articleSection.
 */
function buildJsonLd(item) {
  const url = `${SITE_URL}/explorer/${item.slug}`;
  const imageUrl = imageDePartage(item.cover);
  const datePublished = toIsoString(item.date);

  return {
    "@context": "https://schema.org",
    "@type": item.kind === "expedition" ? "BlogPosting" : "Article",
    headline: item.title,
    description:
      item.description ||
      "Explorer : le terrain du Locomotion Lab — expéditions, protocoles, carnets et fiches.",
    image: [imageUrl],
    ...(datePublished ? { datePublished, dateModified: datePublished } : {}),
    ...(item.kind === "expedition" ? {} : { articleSection: item.kindLabel }),
    author: {
      "@type": "Organization",
      name: "The Locomotion Lab",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "The Locomotion Lab",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: LOGO_URL,
        width: LOGO_SIZE,
        height: LOGO_SIZE,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    inLanguage: "fr-FR",
    ...(Array.isArray(item.tags) && item.tags.length
      ? { keywords: item.tags.filter(Boolean).join(", ") }
      : {}),
  };
}
