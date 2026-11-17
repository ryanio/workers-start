import { describe, expect, it } from "vitest";
import { createPageHead } from "../src/head.js";

const { pageHead } = createPageHead({
  url: "https://example.com/",
  name: "Example",
  defaultImage: "/og/main.png",
  twitterCreator: "@example",
});

const content = (tags: ReturnType<typeof pageHead>, key: string) =>
  tags.meta.find((m) => ("name" in m && m.name === key) || ("property" in m && m.property === key)) as
    | { content: string }
    | undefined;

describe("pageHead", () => {
  it("gives every page its own Open Graph and Twitter set", () => {
    const tags = pageHead({ title: "About", description: "Who we are.", path: "/about" });
    expect(tags.meta[0]).toEqual({ title: "About | Example" });
    expect(content(tags, "og:title")?.content).toBe("About");
    expect(content(tags, "twitter:title")?.content).toBe("About");
    expect(content(tags, "twitter:description")?.content).toBe("Who we are.");
    expect(content(tags, "og:url")?.content).toBe("https://example.com/about");
    expect(content(tags, "og:image")?.content).toBe("https://example.com/og/main.png");
    expect(tags.links).toEqual([{ rel: "canonical", href: "https://example.com/about" }]);
  });

  it("writes the homepage canonical without a trailing slash", () => {
    const tags = pageHead({ title: "Example", rawTitle: true, description: "Home.", path: "/" });
    expect(tags.meta[0]).toEqual({ title: "Example" });
    expect(tags.links[0]?.href).toBe("https://example.com");
  });

  it("adds article dates and noindex when asked", () => {
    const tags = pageHead({
      title: "Post",
      description: "A post.",
      path: "/blog/post",
      type: "article",
      published: "2026-01-10",
      modified: "2026-08-11",
      noindex: true,
    });
    expect(content(tags, "og:type")?.content).toBe("article");
    expect(content(tags, "article:published_time")?.content).toBe("2026-01-10");
    expect(content(tags, "robots")?.content).toBe("noindex");
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
