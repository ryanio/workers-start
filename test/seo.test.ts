import { describe, expect, it } from "vitest";
import { robotsTxt, sitemapXml } from "../src/seo.js";

describe("sitemapXml", () => {
  it("writes one element per line and leaves out missing fields", () => {
    expect(
      sitemapXml([
        {
          url: "https://example.com",
          lastModified: new Date("2026-11-01T00:00:00Z"),
          changeFrequency: "daily",
          priority: 1,
        },
        { url: "https://example.com/about", lastModified: "2026-10-02" },
      ]),
    ).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>https://example.com</loc>
<lastmod>2026-11-01T00:00:00.000Z</lastmod>
<changefreq>daily</changefreq>
<priority>1</priority>
</url>
<url>
<loc>https://example.com/about</loc>
<lastmod>2026-10-02</lastmod>
</url>
</urlset>
`);
  });

  it("escapes URLs so a query string stays valid XML", () => {
    expect(sitemapXml([{ url: "https://example.com/?a=1&b=<2>" }])).toContain(
      "<loc>https://example.com/?a=1&amp;b=&lt;2&gt;</loc>",
    );
  });

  it("keeps priority 0 and drops an empty lastModified", () => {
    const xml = sitemapXml([
      { url: "https://example.com", lastModified: "", priority: 0 },
    ]);
    expect(xml).toContain("<priority>0</priority>");
    expect(xml).not.toContain("<lastmod>");
  });

  it("writes an empty urlset for no entries", () => {
    expect(sitemapXml([])).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>
`);
  });
});

describe("robotsTxt", () => {
  it("allows everything by default", () => {
    expect(robotsTxt()).toBe("User-Agent: *\nAllow: /\n");
  });

  it("writes groups, then Host and Sitemap", () => {
    expect(
      robotsTxt({
        rules: [
          { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] },
          { userAgent: ["GPTBot", "ClaudeBot"], allow: ["/", "/docs"] },
        ],
        host: "https://www.example.com",
        sitemap: "https://www.example.com/sitemap.xml",
      }),
    ).toBe(`User-Agent: *
Allow: /
Disallow: /api/
Disallow: /admin

User-Agent: GPTBot
User-Agent: ClaudeBot
Allow: /
Allow: /docs

Host: https://www.example.com
Sitemap: https://www.example.com/sitemap.xml
`);
  });

  it("writes a line per sitemap", () => {
    expect(
      robotsTxt({ sitemap: ["https://a.test/1.xml", "https://a.test/2.xml"] }),
    ).toBe(
      "User-Agent: *\nAllow: /\n\nSitemap: https://a.test/1.xml\nSitemap: https://a.test/2.xml\n",
    );
  });
});
