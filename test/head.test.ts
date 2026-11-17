import { describe, expect, it } from "vitest";
import { createPageHead, jsonLdScript } from "../src/head.js";

const { pageHead, absoluteUrl } = createPageHead({
  url: "https://example.com/",
  name: "Example",
  defaultImage: "/og/main.png",
  twitterCreator: "@author",
  twitterSite: "@example",
});

type Tags = ReturnType<typeof pageHead>;
const content = (tags: Tags, key: string) =>
  tags.meta.find((m) => ("name" in m && m.name === key) || ("property" in m && m.property === key)) as
    | { content: string }
    | undefined;
const all = (tags: Tags, key: string) =>
  tags.meta.filter((m) => "property" in m && m.property === key).map((m) => (m as { content: string }).content);

describe("pageHead", () => {
  it("gives every page its own Open Graph and Twitter set", () => {
    const tags = pageHead({ title: "About", description: "Who we are.", path: "/about" });
    expect(tags.meta[0]).toEqual({ title: "About | Example" });
    expect(content(tags, "og:title")?.content).toBe("About");
    expect(content(tags, "twitter:title")?.content).toBe("About");
    expect(content(tags, "twitter:site")?.content).toBe("@example");
    expect(content(tags, "twitter:creator")?.content).toBe("@author");
    expect(content(tags, "og:url")?.content).toBe("https://example.com/about");
    expect(content(tags, "og:image")?.content).toBe("https://example.com/og/main.png");
    expect(tags.links).toEqual([{ rel: "canonical", href: "https://example.com/about" }]);
  });

  it("writes the homepage canonical without a trailing slash", () => {
    const tags = pageHead({ title: "Example", rawTitle: true, description: "Home.", path: "/" });
    expect(tags.meta[0]).toEqual({ title: "Example" });
    expect(tags.links[0]?.href).toBe("https://example.com");
  });

  it("writes image details only when given", () => {
    const sized = pageHead({
      title: "T",
      description: "D",
      path: "/t",
      image: { url: "/card.png", width: 1200, height: 630, type: "image/png" },
    });
    expect(content(sized, "og:image:width")?.content).toBe("1200");
    expect(content(sized, "og:image:type")?.content).toBe("image/png");
    expect(content(sized, "og:image:alt")).toBeUndefined();
    const legacy = pageHead({ title: "T", description: "D", path: "/t", imageSize: { width: 1, height: 2, alt: "A" } });
    expect(content(legacy, "og:image:alt")?.content).toBe("A");
    expect(content(legacy, "twitter:image:alt")?.content).toBe("A");
  });

  it("adds article fields, keywords, robots and extra tags", () => {
    const tags = pageHead({
      title: "Post",
      description: "A post.",
      path: "/blog/post",
      type: "article",
      published: "2026-01-10",
      authors: ["Ann", "Bo"],
      tags: ["gas"],
      keywords: ["a", "b"],
      robots: "noindex, follow",
      meta: [{ name: "apple-itunes-app", content: "app-id=1" }],
    });
    expect(content(tags, "og:type")?.content).toBe("article");
    expect(all(tags, "article:author")).toEqual(["Ann", "Bo"]);
    expect(all(tags, "article:tag")).toEqual(["gas"]);
    expect(content(tags, "keywords")?.content).toBe("a, b");
    expect(content(tags, "robots")?.content).toBe("noindex, follow");
    expect(content(tags, "apple-itunes-app")?.content).toBe("app-id=1");
  });

  it("overrides or drops the canonical", () => {
    expect(pageHead({ title: "T", description: "D", path: "/a", canonical: "/b" }).links[0]?.href).toBe(
      "https://example.com/b",
    );
    expect(pageHead({ title: "T", description: "D", path: "/a", canonical: false }).links).toEqual([]);
  });

  it("falls back to a summary card with no image", () => {
    const bare = createPageHead({ url: "https://example.com", name: "Bare" }).pageHead({
      title: "T",
      description: "D",
      path: "/t",
    });
    expect(content(bare, "twitter:card")?.content).toBe("summary");
    expect(content(bare, "og:image")).toBeUndefined();
  });
});

describe("site defaults", () => {
  const site = createPageHead({
    url: "https://example.com",
    name: "Example",
    defaultImage: { url: "/og.png", width: 1200, height: 630, alt: "Example card" },
    robots: "index, follow",
    keywords: ["one", "two"],
    authors: [{ name: "Ann", url: "https://x.com/ann" }, { name: "Bo" }],
    meta: [
      { name: "application-name", content: "Example" },
      { name: "apple-itunes-app", content: "app-id=1" },
    ],
  });

  it("writes the site's robots, keywords, authors, tags and image size on every page", () => {
    const tags = site.pageHead({ title: "T", description: "D", path: "/t" });
    expect(content(tags, "robots")?.content).toBe("index, follow");
    expect(content(tags, "keywords")?.content).toBe("one, two");
    expect(tags.meta.filter((m) => "name" in m && m.name === "author")).toEqual([
      { name: "author", content: "Ann" },
      { name: "author", content: "Bo" },
    ]);
    expect(content(tags, "application-name")?.content).toBe("Example");
    expect(content(tags, "og:image:width")?.content).toBe("1200");
    expect(content(tags, "twitter:image:alt")?.content).toBe("Example card");
    expect(tags.links).toEqual([
      { rel: "canonical", href: "https://example.com/t" },
      { rel: "author", href: "https://x.com/ann" },
    ]);
  });

  it("lets a page replace each default", () => {
    const tags = site.pageHead({
      title: "T",
      description: "D",
      path: "/t",
      noindex: true,
      keywords: ["three"],
      meta: [{ name: "apple-itunes-app", content: "app-id=2" }],
    });
    expect(content(tags, "robots")?.content).toBe("noindex");
    expect(content(tags, "keywords")?.content).toBe("three");
    expect(tags.meta.filter((m) => "name" in m && m.name === "apple-itunes-app")).toEqual([
      { name: "apple-itunes-app", content: "app-id=2" },
    ]);
  });
});

describe("page links and structured data", () => {
  it("writes alternates after the canonical, then extra links", () => {
    const tags = pageHead({
      title: "T",
      description: "D",
      path: "/t",
      alternates: [
        { hreflang: "ja", href: "/ja/t" },
        { type: "application/rss+xml", title: "Feed", href: "https://example.com/feed.xml" },
      ],
      links: [{ rel: "preload", href: "/font.woff2", type: "font/woff2" }],
    });
    expect(tags.links).toEqual([
      { rel: "canonical", href: "https://example.com/t" },
      { rel: "alternate", hreflang: "ja", href: "https://example.com/ja/t" },
      { rel: "alternate", type: "application/rss+xml", title: "Feed", href: "https://example.com/feed.xml" },
      { rel: "preload", href: "/font.woff2", type: "font/woff2" },
    ]);
  });

  it("writes article:section", () => {
    const tags = pageHead({ title: "T", description: "D", path: "/t", type: "article", section: "Guides" });
    expect(content(tags, "article:section")?.content).toBe("Guides");
  });

  it("writes JSON-LD as one script that cannot close its tag", () => {
    const tags = pageHead({
      title: "T",
      description: "D",
      path: "/t",
      jsonLd: { "@type": "Article", headline: "</script><b>&" },
    });
    expect(tags.scripts).toHaveLength(1);
    const script = tags.scripts?.[0];
    expect(script?.type).toBe("application/ld+json");
    expect(script?.children).not.toMatch(/[<>&]/);
    expect(JSON.parse(script?.children ?? "")).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "</script><b>&",
    });
    expect(pageHead({ title: "T", description: "D", path: "/t" }).scripts).toBeUndefined();
  });

  it("wraps several JSON-LD nodes in a graph and keeps a given context", () => {
    expect(JSON.parse(jsonLdScript([{ "@type": "Organization" }, { "@type": "WebSite" }]).children)).toEqual({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Organization" }, { "@type": "WebSite" }],
    });
    expect(JSON.parse(jsonLdScript({ "@context": "https://example.org", "@type": "Thing" }).children)).toEqual({
      "@context": "https://example.org",
      "@type": "Thing",
    });
  });
});

describe("absoluteUrl", () => {
  it("resolves paths and passes absolute URLs through", () => {
    expect(absoluteUrl("/")).toBe("https://example.com");
    expect(absoluteUrl("/a")).toBe("https://example.com/a");
    expect(absoluteUrl("about")).toBe("https://example.com/about");
    expect(absoluteUrl("//cdn.example.net/i.png")).toBe("https://cdn.example.net/i.png");
    expect(absoluteUrl("HTTPS://cdn.example.net/i.png")).toBe("https://cdn.example.net/i.png");
  });
});
