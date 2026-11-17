import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEntry,
  defaultIsPage,
  mergeVary,
  normalizePath,
  underPrefix,
  wantsMarkdown,
} from "../src/entry.js";

// A stand-in for the Start handler: Start answers 406 to page requests whose
// Accept rules out HTML, routes /API/x like /api/x, and renders an empty 200
// shell for a method a route does not define.
const start = {
  calls: [] as Request[],
  fetch(request: Request): Response {
    start.calls.push(request);
    const accept = request.headers.get("accept") ?? "*/*";
    const { pathname } = new URL(request.url);
    if (pathname.toLowerCase().startsWith("/api")) {
      return request.method === "GET" || request.method === "HEAD"
        ? Response.json({ ok: true })
        : new Response("<html></html>", {
            headers: { "content-type": "text/html" },
          });
    }
    if (pathname.endsWith("/")) {
      return new Response(null, {
        status: 307,
        headers: { location: pathname.slice(0, -1) },
      });
    }
    if (!/(^|,)\s*(\*\/\*|text\/html)/.test(accept)) {
      return Response.json(
        { error: "Only HTML requests are supported here" },
        { status: 406 },
      );
    }
    const headers: Record<string, string> = {
      "content-type": "text/html; charset=utf-8",
    };
    if (pathname === "/encoded") headers.vary = "accept-encoding";
    return new Response(`<html>${pathname}</html>`, { headers });
  },
};

const renderer = vi.fn(
  (
    path: string,
  ): ReturnType<NonNullable<Parameters<typeof createEntry>[0]["markdown"]>> => {
    if (path === "/") return "# Home";
    if (path === "/learn") return "# Learn";
    if (path === "/learn/café") return "# Café";
    if (path === "/html-only") return null;
    if (path === "/empty") return { body: "", status: 204 };
    if (path === "/broken") throw new Error("boom");
    return { body: `# Not found: ${path}`, status: 404 };
  },
);

const entry = createEntry({ handler: start, markdown: renderer });

const send = (path: string, accept?: string, method = "GET") =>
  entry.fetch(
    new Request(`https://example.com${path}`, {
      method,
      headers: accept ? { accept } : {},
    }),
  );

afterEach(() => {
  start.calls.length = 0;
  renderer.mockClear();
});

describe("Markdown negotiation", () => {
  it("serves the Markdown rendering on the same URL", async () => {
    const res = await send("/learn/", "text/markdown");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(res.headers.get("vary")).toBe("Accept");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toBe("# Learn");
  });

  it("passes the renderer a decoded path", async () => {
    expect(await (await send("/learn/caf%C3%A9", "text/markdown")).text()).toBe(
      "# Café",
    );
  });

  it("respects q-values and case", async () => {
    expect(
      (await send("/learn", "text/markdown;q=0, text/html")).headers.get(
        "content-type",
      ),
    ).toContain("text/html");
    expect(
      (await send("/learn", "text/html, text/markdown;q=0.1")).headers.get(
        "content-type",
      ),
    ).toContain("text/html");
    expect(
      (await send("/learn", "Text/Markdown")).headers.get("content-type"),
    ).toContain("text/markdown");
    expect((await send("/learn", "*/*")).headers.get("content-type")).toContain(
      "text/html",
    );
  });

  it("passes the renderer's status through, with no body where the status forbids one", async () => {
    const missing = await send("/missing", "text/markdown");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("# Not found: /missing");
    expect((await send("/empty", "text/markdown")).status).toBe(204);
  });

  it("answers HEAD with headers and no body", async () => {
    const res = await send("/", "text/markdown", "HEAD");
    expect(res.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(await res.text()).toBe("");
  });

  it("serves HTML when the renderer returns null or throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      (await send("/html-only", "text/markdown")).headers.get("content-type"),
    ).toContain("text/html");
    expect(
      (await send("/broken", "text/markdown")).headers.get("content-type"),
    ).toContain("text/html");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe("Markdown from rendered HTML", () => {
  it("gives the renderer the page as HTML, with the extra fetch arguments", async () => {
    const seen: unknown[] = [];
    const handler = {
      fetch(request: Request, env: unknown) {
        seen.push(env);
        return start.fetch(request);
      },
    };
    const converting = createEntry({
      handler,
      markdown: async (_path, _request, page) =>
        (await (await page.html()).text()).replace("<html>", "# "),
    });
    const res = await converting.fetch(
      new Request("https://example.com/learn", {
        headers: { accept: "text/markdown" },
      }),
      "env",
    );
    expect(await res.text()).toBe("# /learn</html>");
    expect(start.calls[0]?.headers.get("accept")).toBe("text/html");
    expect(seen).toEqual(["env"]);
  });
});

describe("HTML pages", () => {
  it("serves HTML instead of 406 when Accept rules HTML out", async () => {
    const res = await send("/learn", "application/json");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>/learn</html>");
    expect((await send("/learn", "text/html;q=0")).status).toBe(200);
  });

  it("adds Vary: Accept to every page response, redirects included, without duplicating", async () => {
    expect((await send("/learn", "text/html")).headers.get("vary")).toBe(
      "Accept",
    );
    expect((await send("/learn/", "text/html")).headers.get("vary")).toBe(
      "Accept",
    );
    expect((await send("/encoded")).headers.get("vary")).toBe(
      "accept-encoding, Accept",
    );
  });

  it("answers HEAD for HTML pages through the handler", async () => {
    const res = await send("/learn", "text/html", "HEAD");
    expect(start.calls[0]?.method).toBe("HEAD");
    expect(res.headers.get("vary")).toBe("Accept");
  });

  it("leaves Vary alone when Markdown is off", async () => {
    const plain = createEntry({ handler: start });
    const res = await plain.fetch(new Request("https://example.com/learn"));
    expect(res.headers.get("vary")).toBeNull();
  });
});

describe("read-only prefixes", () => {
  it("answers writes with 405, however the path is spelled", async () => {
    for (const path of [
      "/api/gas",
      "/API/gas",
      "/%61pi/gas",
      "//api//gas",
      "/api",
    ]) {
      const res = await send(path, undefined, "POST");
      expect(res.status, path).toBe(405);
      expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    }
  });

  it("answers CORS preflight with 204", async () => {
    const res = await send("/api/gas", undefined, "OPTIONS");
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("passes reads through untouched, Markdown Accept or not", async () => {
    expect(await (await send("/API/gas", "text/markdown")).json()).toEqual({
      ok: true,
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it("can be turned off", async () => {
    const open = createEntry({ handler: start, readOnlyPrefixes: [] });
    const res = await open.fetch(
      new Request("https://example.com/api/x", { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  it("does not match a longer segment", () => {
    expect(underPrefix("/apiary", "/api")).toBe(false);
    expect(underPrefix("/api", "/api/")).toBe(true);
  });
});

describe("page detection", () => {
  it("excludes the API, internals and files, but keeps dotted slugs", () => {
    expect(defaultIsPage("/")).toBe(true);
    expect(defaultIsPage("/blog/node.js-tips")).toBe(true);
    expect(defaultIsPage("/v1.2")).toBe(true);
    expect(defaultIsPage("/@handle")).toBe(true);
    expect(defaultIsPage("/api/gas")).toBe(false);
    expect(defaultIsPage("/_serverFn/abc")).toBe(false);
    expect(defaultIsPage("/@vite/client")).toBe(false);
    expect(defaultIsPage("/sitemap.xml")).toBe(false);
    expect(defaultIsPage("/llms.txt")).toBe(false);
  });

  it("uses a custom isPage, passing other paths to the handler untouched", async () => {
    const custom = createEntry({
      handler: start,
      markdown: renderer,
      isPage: (p) => p === "/",
    });
    const res = await custom.fetch(
      new Request("https://example.com/learn", {
        headers: { accept: "text/markdown" },
      }),
    );
    expect(renderer).not.toHaveBeenCalled();
    expect(start.calls[0]?.headers.get("accept")).toBe("text/markdown");
    expect(res.headers.get("vary")).toBeNull();
  });
});

describe("helpers", () => {
  it("normalizes paths", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/learn//")).toBe("/learn");
    expect(normalizePath("/a/%E0%A4%A")).toBe("/a/%E0%A4%A");
  });

  it("merges Vary tokens case-insensitively and leaves * alone", () => {
    expect(mergeVary(null, "Accept")).toBe("Accept");
    expect(mergeVary("Accept, Accept-Encoding", "Accept")).toBe(
      "Accept, Accept-Encoding",
    );
    expect(mergeVary("*", "Accept")).toBe("*");
  });

  it("reads Accept from a request", () => {
    expect(
      wantsMarkdown(
        new Request("https://x", {
          headers: { accept: "text/markdown, text/html" },
        }),
      ),
    ).toBe(true);
    expect(wantsMarkdown(new Request("https://x"))).toBe(false);
  });
});
