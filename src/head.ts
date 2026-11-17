/**
 * Per-page head tags in the shape a TanStack Router `head()` returns.
 *
 * The router keeps one meta per `name` or `property`, deepest route winning,
 * so any tag a page leaves out falls back to a parent's. This helper writes
 * the full Open Graph and Twitter set for every page so nothing inherits the
 * homepage's share card by accident.
 */

export interface SiteHead {
  /** Absolute origin, no trailing slash: `https://example.com`. */
  url: string;
  /** Used for `og:site_name` and the default title suffix. */
  name: string;
  /** Path under the site of the default share image. */
  defaultImage?: string;
  /** Twitter handle with the @. */
  twitterCreator?: string;
  /** Default `en_US`. */
  locale?: string;
  /** Default `(title) => \`${title} | ${name}\``. */
  titleTemplate?: (title: string) => string;
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
  /** Path under the site, or an absolute URL. */
  image?: string;
  imageSize?: { width: number; height: number; alt: string };
  /** ISO date, for articles. */
  published?: string;
  /** ISO date, for articles. */
  modified?: string;
  /** Adds `robots: noindex`. */
  noindex?: boolean;
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
  const origin = site.url.replace(/\/+$/, "");
  const template = site.titleTemplate ?? ((title: string) => `${title} | ${site.name}`);

  const absoluteUrl = (path: string): string => {
    if (/^https?:\/\//.test(path)) {
      return path;
    }
    return path === "/" ? origin : `${origin}${path}`;
  };

  const pageHead = (seo: PageSeo): HeadTags => {
    const url = absoluteUrl(seo.path);
    const socialTitle = seo.socialTitle ?? seo.title;
    const socialDescription = seo.socialDescription ?? seo.description;
    const imagePath = seo.image ?? site.defaultImage;
    const image = imagePath ? absoluteUrl(imagePath) : undefined;

    const meta: MetaTag[] = [
      { title: seo.rawTitle ? seo.title : template(seo.title) },
      { name: "description", content: seo.description },
    ];
    if (seo.noindex) {
      meta.push({ name: "robots", content: "noindex" });
    }
    meta.push(
      { property: "og:title", content: socialTitle },
      { property: "og:description", content: socialDescription },
      { property: "og:url", content: url },
      { property: "og:site_name", content: site.name },
      { property: "og:locale", content: site.locale ?? "en_US" },
    );
    if (image) {
      meta.push({ property: "og:image", content: image });
    }
    if (image && seo.imageSize) {
      meta.push(
        { property: "og:image:width", content: String(seo.imageSize.width) },
        { property: "og:image:height", content: String(seo.imageSize.height) },
        { property: "og:image:alt", content: seo.imageSize.alt },
      );
    }
    meta.push({ property: "og:type", content: seo.type ?? "website" });
    if (seo.published) {
      meta.push({ property: "article:published_time", content: seo.published });
    }
    if (seo.modified) {
      meta.push({ property: "article:modified_time", content: seo.modified });
    }
    meta.push({ name: "twitter:card", content: image ? "summary_large_image" : "summary" });
    if (site.twitterCreator) {
      meta.push({ name: "twitter:creator", content: site.twitterCreator });
    }
    meta.push(
      { name: "twitter:title", content: socialTitle },
      { name: "twitter:description", content: seo.twitterDescription ?? socialDescription },
    );
    if (image) {
      meta.push({ name: "twitter:image", content: image });
    }

    return { meta, links: [{ rel: "canonical", href: url }] };
  };

  return { pageHead, absoluteUrl };
}
