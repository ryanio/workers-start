import { describe, expect, it } from "vitest";
import { createPageHead } from "../src/head.js";

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

describe("absoluteUrl", () => {
  it("resolves paths and passes absolute URLs through", () => {
    expect(absoluteUrl("/")).toBe("https://example.com");
    expect(absoluteUrl("/a")).toBe("https://example.com/a");
    expect(absoluteUrl("about")).toBe("https://example.com/about");
    expect(absoluteUrl("//cdn.example.net/i.png")).toBe("https://cdn.example.net/i.png");
    expect(absoluteUrl("HTTPS://cdn.example.net/i.png")).toBe("https://cdn.example.net/i.png");
  });
});
