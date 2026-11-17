import { describe, expect, it } from "vitest";
import { createEntry, defaultIsPage, normalizePath } from "../src/entry.js";

// A stand-in for the Start handler: Start answers 406 to page requests whose
// Accept rules out HTML, and an empty 200 shell for an unsupported method.
const start = {
  fetch(request: Request): Response {
    const accept = request.headers.get("accept") ?? "*/*";
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) {
      return Response.json({ ok: true });
    }
    if (!/(^|,)\s*(\*\/\*|text\/html)/.test(accept)) {
      return Response.json({ error: "Only HTML requests are supported here" }, { status: 406 });
    }
    return new Response(`<html>${pathname}</html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};

const entry = createEntry({
  handler: start,
  markdown: (pathname) => {
    if (pathname === "/") return "# Home";
    if (pathname === "/learn") return "# Learn";
    if (pathname === "/html-only") return null;
    return { body: `# Not found: ${pathname}`, status: 404 };
  },
});

const get = (path: string, accept?: string, method = "GET") =>
  entry.fetch(new Request(`https://example.com${path}`, { method, headers: accept ? { accept } : {} }));

describe("createEntry", () => {
  it("serves the Markdown rendering on the same URL", async () => {
    const res = await get("/learn/", "text/markdown");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary")).toBe("Accept");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toBe("# Learn");
  });

  it("passes the renderer's status through", async () => {
    const res = await get("/missing", "text/markdown");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("# Not found: /missing");
  });

  it("answers HEAD for Markdown with headers and no body", async () => {
    const res = await get("/", "text/markdown", "HEAD");
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe("");
  });

  it("falls back to HTML when the renderer returns null", async () => {
    const res = await get("/html-only", "text/markdown, text/html;q=0.9");
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("adds Vary: Accept to HTML pages", async () => {
    const res = await get("/learn", "text/html");
    expect(res.headers.get("vary")).toBe("Accept");
  });

  it("serves HTML instead of 406 when Accept names some other type", async () => {
    const res = await get("/learn", "application/json");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>/learn</html>");
  });

  it("answers non-read methods on the API with 405", async () => {
    const res = await get("/api/gas", undefined, "POST");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  it("leaves the API and files alone, Markdown Accept or not", async () => {
    const api = await get("/api/gas", "text/markdown");
    expect(await api.json()).toEqual({ ok: true });
    const file = await get("/llms.txt", "text/markdown");
    expect(file.headers.get("vary")).toBeNull();
  });
});

describe("defaultIsPage", () => {
  it("excludes the API, framework internals and files", () => {
    expect(defaultIsPage("/")).toBe(true);
    expect(defaultIsPage("/learn/what-is-gas")).toBe(true);
    expect(defaultIsPage("/api/gas")).toBe(false);
    expect(defaultIsPage("/_serverFn/abc")).toBe(false);
    expect(defaultIsPage("/@vite/client")).toBe(false);
    expect(defaultIsPage("/sitemap.xml")).toBe(false);
  });
});

describe("normalizePath", () => {
  it("drops trailing slashes but keeps the root", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/learn//")).toBe("/learn");
  });
});
