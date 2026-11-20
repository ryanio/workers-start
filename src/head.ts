/**
 * Per-page head tags in the shape a TanStack Router `head()` returns.
 *
 * The router keeps one meta per `name` or `property`, deepest route winning,
 * and concatenates links. So call `pageHead` from leaf routes only: a tag a
 * leaf leaves out falls back to a parent's, and a canonical from both a
 * layout and a leaf is emitted twice. Put site-wide tags (charset, viewport,
 * icons) in the root route without this helper.
 */

import { inlineJson } from "./scripts.js";

export interface SiteHead {
  /** Absolute origin: `https://example.com`. A trailing slash is ignored. */
  url: string;
  /** Used for `og:site_name` and the default title suffix. */
  name: string;
  /** The default share image: a path or URL, or an object with size, alt and type. */
  defaultImage?: string | PageImage;
  /** Author's handle with the @, for `twitter:creator`. */
  twitterCreator?: string;
  /** Site's handle with the @, for `twitter:site`. */
  twitterSite?: string;
  /** Default `en_US`. */
  locale?: string;
  /** Default `(title) => \`${title} | ${name}\``. */
  titleTemplate?: (title: string) => string;
  /** Robots directive for pages that set neither `robots` nor `noindex`, such as `index, follow`. */
  robots?: string;
  /** Keywords for pages that set none. */
  keywords?: string[];
  /** Site authors: a `meta name="author"` each, and a `link rel="author"` for each with a URL. */
  authors?: { name: string; url?: string }[];
  /**
   * Tags written on every page before the page's own `meta`, such as
   * `application-name` or an App Store banner. A page tag with the same
   * name or property replaces the site's.
   */
  meta?: MetaTag[];
}

export interface PageImage {
  /** Path under the site, or an absolute URL. */
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  /** MIME type, such as `image/png`. */
  type?: string;
}

export interface PageSeo {
  title: string;
  /** Use `title` as the whole document title, without the template. */
  rawTitle?: boolean;
  description: string;
  /** Path under the site, starting with "/". "/" is the homepage. */
  path: string;
  type?: "website" | "article";
  /** Defaults to `title`. */
  socialTitle?: string;
  /** Defaults to `description`. */
  socialDescription?: string;
  /** Defaults to `socialDescription`. */
  twitterDescription?: string;
  /** A path or URL, or an object with size, alt and type. Defaults to the site's image. */
  image?: string | PageImage;
  /** @deprecated Use `image: { url, width, height, alt }`. */
  imageSize?: { width: number; height: number; alt?: string };
  /** ISO date, for articles. */
  published?: string;
  /** ISO date, for articles. */
  modified?: string;
  /** For articles: author names or profile URLs, one `article:author` each. */
  authors?: string[];
  /** For articles: one `article:tag` each. */
  tags?: string[];
  /** For articles: `article:section`. */
  section?: string;
  keywords?: string[];
  /** Adds `robots: noindex`. Ignored when `robots` is set. */
  noindex?: boolean;
  /** Full robots directive, such as `noindex, follow` or `max-image-preview:large`. */
  robots?: string;
  /** Override the canonical URL, or `false` to emit none. Defaults to the page URL. */
  canonical?: string | false;
  /** Extra tags, appended last. */
  meta?: MetaTag[];
  /**
   * `link rel="alternate"` entries after the canonical: language versions
   * with `hreflang`, or feeds with `type`. `href` is a path or URL.
   */
  alternates?: {
    href: string;
    hreflang?: string;
    type?: string;
    title?: string;
  }[];
  /** Extra links, appended last as given. */
  links?: HeadLink[];
  /**
   * schema.org data, written as one `application/ld+json` script. An array
   * becomes an `@graph`. `@context` is added when missing.
   */
  jsonLd?: object | object[];
}

export type MetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

export interface HeadLink {
  rel: string;
  href: string;
  type?: string;
  hreflang?: string;
  title?: string;
  sizes?: string;
}

export interface HeadScript {
  type: string;
  children: string;
}

export interface HeadTags {
  meta: MetaTag[];
  links: HeadLink[];
  /** Present only when the page passes `jsonLd`. */
  scripts?: HeadScript[];
}

const SCHEMA_CONTEXT = "https://schema.org";

/**
 * A JSON-LD script for a route's `head().scripts`. An array becomes an
 * `@graph`; `@context` is added when missing. The body is escaped with
 * `inlineJson`, so no value can close the script tag.
 */
export function jsonLdScript(data: object | object[]): HeadScript {
  const body = Array.isArray(data)
    ? { "@context": SCHEMA_CONTEXT, "@graph": data }
    : "@context" in data
      ? data
      : { "@context": SCHEMA_CONTEXT, ...data };
  return { type: "application/ld+json", children: inlineJson(body) };
}

/** The name or property a meta tag is keyed by, or undefined for the title. */
function metaKey(tag: MetaTag): string | undefined {
  if ("name" in tag) return `name:${tag.name}`;
  if ("property" in tag) return `property:${tag.property}`;
  return undefined;
}

export function createPageHead(site: SiteHead): {
  pageHead: (seo: PageSeo) => HeadTags;
  absoluteUrl: (path: string) => string;
} {
  const origin = new URL(site.url).origin;
  const template =
    site.titleTemplate ?? ((title: string) => `${title} | ${site.name}`);

  /** `/` maps to the bare origin; anything else resolves against it, so absolute URLs pass through. */
  const absoluteUrl = (path: string): string => {
    if (path === "/" || path === "") {
      return origin;
    }
    const resolved = new URL(
      path.startsWith("/") || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(path)
        ? path
        : `/${path}`,
      `${origin}/`,
    );
    return resolved.href;
  };

  const pageHead = (seo: PageSeo): HeadTags => {
    const url = absoluteUrl(seo.path);
    const socialTitle = seo.socialTitle ?? seo.title;
    const socialDescription = seo.socialDescription ?? seo.description;
    const imageInput = seo.image ?? site.defaultImage;
    const image: PageImage | undefined =
      typeof imageInput === "string"
        ? { url: imageInput, ...seo.imageSize }
        : imageInput;
    const imageUrl = image ? absoluteUrl(image.url) : undefined;

    const meta: MetaTag[] = [
      { title: seo.rawTitle ? seo.title : template(seo.title) },
      { name: "description", content: seo.description },
    ];
    const robots = seo.robots ?? (seo.noindex ? "noindex" : site.robots);
    if (robots) {
      meta.push({ name: "robots", content: robots });
    }
    const keywords = seo.keywords ?? site.keywords;
    if (keywords?.length) {
      meta.push({ name: "keywords", content: keywords.join(", ") });
    }
    for (const author of site.authors ?? []) {
      meta.push({ name: "author", content: author.name });
    }
    meta.push(
      { property: "og:title", content: socialTitle },
      { property: "og:description", content: socialDescription },
      { property: "og:url", content: url },
      { property: "og:site_name", content: site.name },
      { property: "og:locale", content: site.locale ?? "en_US" },
    );
    if (image && imageUrl) {
      meta.push({ property: "og:image", content: imageUrl });
      if (image.type)
        meta.push({ property: "og:image:type", content: image.type });
      if (image.width)
        meta.push({ property: "og:image:width", content: String(image.width) });
      if (image.height)
        meta.push({
          property: "og:image:height",
          content: String(image.height),
        });
      if (image.alt)
        meta.push({ property: "og:image:alt", content: image.alt });
    }
    meta.push({ property: "og:type", content: seo.type ?? "website" });
    if (seo.published)
      meta.push({ property: "article:published_time", content: seo.published });
    if (seo.modified)
      meta.push({ property: "article:modified_time", content: seo.modified });
    for (const author of seo.authors ?? [])
      meta.push({ property: "article:author", content: author });
    for (const tag of seo.tags ?? [])
      meta.push({ property: "article:tag", content: tag });
    if (seo.section)
      meta.push({ property: "article:section", content: seo.section });

    meta.push({
      name: "twitter:card",
      content: imageUrl ? "summary_large_image" : "summary",
    });
    if (site.twitterSite)
      meta.push({ name: "twitter:site", content: site.twitterSite });
    if (site.twitterCreator)
      meta.push({ name: "twitter:creator", content: site.twitterCreator });
    meta.push(
      { name: "twitter:title", content: socialTitle },
      {
        name: "twitter:description",
        content: seo.twitterDescription ?? socialDescription,
      },
    );
    if (imageUrl) {
      meta.push({ name: "twitter:image", content: imageUrl });
      if (image?.alt)
        meta.push({ name: "twitter:image:alt", content: image.alt });
    }
    const pageKeys = new Set((seo.meta ?? []).map(metaKey));
    meta.push(
      ...(site.meta ?? []).filter((tag) => !pageKeys.has(metaKey(tag))),
    );
    meta.push(...(seo.meta ?? []));

    const links: HeadLink[] =
      seo.canonical === false
        ? []
        : [
            {
              rel: "canonical",
              href: seo.canonical ? absoluteUrl(seo.canonical) : url,
            },
          ];
    for (const alternate of seo.alternates ?? []) {
      links.push({
        rel: "alternate",
        ...alternate,
        href: absoluteUrl(alternate.href),
      });
    }
    for (const author of site.authors ?? []) {
      if (author.url)
        links.push({ rel: "author", href: absoluteUrl(author.url) });
    }
    links.push(...(seo.links ?? []));
    return seo.jsonLd
      ? { meta, links, scripts: [jsonLdScript(seo.jsonLd)] }
      : { meta, links };
  };

  return { pageHead, absoluteUrl };
}
