/**
 * Per-page head tags in the shape a TanStack Router `head()` returns.
 *
 * The router keeps one meta per `name` or `property`, deepest route winning,
 * and concatenates links. So call `pageHead` from leaf routes only: a tag a
 * leaf leaves out falls back to a parent's, and a canonical from both a
 * layout and a leaf is emitted twice. Put site-wide tags (charset, viewport,
 * icons) in the root route without this helper.
 */

export interface SiteHead {
  /** Absolute origin: `https://example.com`. A trailing slash is ignored. */
  url: string;
  /** Used for `og:site_name` and the default title suffix. */
  name: string;
  /** Path under the site, or an absolute URL, of the default share image. */
  defaultImage?: string;
  /** Author's handle with the @, for `twitter:creator`. */
  twitterCreator?: string;
  /** Site's handle with the @, for `twitter:site`. */
  twitterSite?: string;
  /** Default `en_US`. */
  locale?: string;
  /** Default `(title) => \`${title} | ${name}\``. */
  titleTemplate?: (title: string) => string;
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
  keywords?: string[];
  /** Adds `robots: noindex`. Ignored when `robots` is set. */
  noindex?: boolean;
  /** Full robots directive, such as `noindex, follow` or `max-image-preview:large`. */
  robots?: string;
  /** Override the canonical URL, or `false` to emit none. Defaults to the page URL. */
  canonical?: string | false;
  /** Extra tags, appended last. */
  meta?: MetaTag[];
}

export type MetaTag = { title: string } | { name: string; content: string } | { property: string; content: string };

export interface HeadTags {
  meta: MetaTag[];
  links: { rel: string; href: string }[];
}

export function createPageHead(site: SiteHead): {
  pageHead: (seo: PageSeo) => HeadTags;
  absoluteUrl: (path: string) => string;
} {
  const origin = new URL(site.url).origin;
  const template = site.titleTemplate ?? ((title: string) => `${title} | ${site.name}`);

  /** `/` maps to the bare origin; anything else resolves against it, so absolute URLs pass through. */
  const absoluteUrl = (path: string): string => {
    if (path === "/" || path === "") {
      return origin;
    }
    const resolved = new URL(
      path.startsWith("/") || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(path) ? path : `/${path}`,
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
      typeof imageInput === "string" ? { url: imageInput, ...seo.imageSize } : imageInput;
    const imageUrl = image ? absoluteUrl(image.url) : undefined;

    const meta: MetaTag[] = [
      { title: seo.rawTitle ? seo.title : template(seo.title) },
      { name: "description", content: seo.description },
    ];
    const robots = seo.robots ?? (seo.noindex ? "noindex" : undefined);
    if (robots) {
      meta.push({ name: "robots", content: robots });
    }
    if (seo.keywords?.length) {
      meta.push({ name: "keywords", content: seo.keywords.join(", ") });
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
      if (image.type) meta.push({ property: "og:image:type", content: image.type });
      if (image.width) meta.push({ property: "og:image:width", content: String(image.width) });
      if (image.height) meta.push({ property: "og:image:height", content: String(image.height) });
      if (image.alt) meta.push({ property: "og:image:alt", content: image.alt });
    }
    meta.push({ property: "og:type", content: seo.type ?? "website" });
    if (seo.published) meta.push({ property: "article:published_time", content: seo.published });
    if (seo.modified) meta.push({ property: "article:modified_time", content: seo.modified });
    for (const author of seo.authors ?? []) meta.push({ property: "article:author", content: author });
    for (const tag of seo.tags ?? []) meta.push({ property: "article:tag", content: tag });

    meta.push({ name: "twitter:card", content: imageUrl ? "summary_large_image" : "summary" });
    if (site.twitterSite) meta.push({ name: "twitter:site", content: site.twitterSite });
    if (site.twitterCreator) meta.push({ name: "twitter:creator", content: site.twitterCreator });
    meta.push(
      { name: "twitter:title", content: socialTitle },
      { name: "twitter:description", content: seo.twitterDescription ?? socialDescription },
    );
    if (imageUrl) {
      meta.push({ name: "twitter:image", content: imageUrl });
      if (image?.alt) meta.push({ name: "twitter:image:alt", content: image.alt });
    }
    meta.push(...(seo.meta ?? []));

    const links =
      seo.canonical === false ? [] : [{ rel: "canonical", href: seo.canonical ? absoluteUrl(seo.canonical) : url }];
    return { meta, links };
  };

  return { pageHead, absoluteUrl };
}
