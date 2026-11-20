/** One `<url>` in a sitemap. Fields follow the sitemap protocol. */
export interface SitemapEntry {
  /** Absolute URL. Escaped for XML on output. */
  url: string;
  /** A Date is written as an ISO timestamp, a string as given. */
  lastModified?: Date | string;
  changeFrequency?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
}

/** One group of rules in robots.txt. */
export interface RobotsRule {
  userAgent: string | readonly string[];
  allow?: string | readonly string[];
  disallow?: string | readonly string[];
}

export interface RobotsOptions {
  /** Defaults to one group that allows everything to every agent. */
  rules?: RobotsRule | readonly RobotsRule[];
  /** Written as a `Host:` line. */
  host?: string;
  /** Absolute sitemap URLs, one `Sitemap:` line each. */
  sitemap?: string | readonly string[];
}

function list<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value as T];
}

/** Escapes the five XML special characters. */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * A sitemap protocol `<urlset>` with one element per line. Fields left out of
 * an entry are left out of its `<url>`.
 */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const lines = ["<url>", `<loc>${escapeXml(entry.url)}</loc>`];
    if (entry.lastModified !== undefined && entry.lastModified !== "") {
      const lastmod =
        entry.lastModified instanceof Date
          ? entry.lastModified.toISOString()
          : entry.lastModified;
      lines.push(`<lastmod>${escapeXml(lastmod)}</lastmod>`);
    }
    if (entry.changeFrequency) {
      lines.push(`<changefreq>${entry.changeFrequency}</changefreq>`);
    }
    if (entry.priority !== undefined) {
      lines.push(`<priority>${entry.priority}</priority>`);
    }
    lines.push("</url>");
    return lines.join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * A robots.txt body: each rule group as `User-Agent`, `Allow` and `Disallow`
 * lines, groups separated by a blank line, then `Host` and `Sitemap`.
 */
export function robotsTxt(options: RobotsOptions = {}): string {
  const rules = list(options.rules);
  const groups = (rules.length > 0 ? rules : [{ userAgent: "*", allow: "/" }])
    .map((rule) =>
      [
        ...list(rule.userAgent).map((agent) => `User-Agent: ${agent}`),
        ...list(rule.allow).map((path) => `Allow: ${path}`),
        ...list(rule.disallow).map((path) => `Disallow: ${path}`),
      ].join("\n"),
    )
    .join("\n\n");
  const footer = [
    ...(options.host ? [`Host: ${options.host}`] : []),
    ...list(options.sitemap).map((url) => `Sitemap: ${url}`),
  ];
  return footer.length > 0
    ? `${groups}\n\n${footer.join("\n")}\n`
    : `${groups}\n`;
}
