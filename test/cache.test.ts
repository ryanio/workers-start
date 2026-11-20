import { describe, expect, it } from "vitest";
import {
  sharedMaxAge,
  withEdgeCache,
  withoutBrowserMaxAge,
} from "../src/cache.js";

/** A Cache stand-in over a map, recording what was stored. */
function memoryCache() {
  const store = new Map<string, Response>();
  return {
    store,
    cache: {
      async match(req: RequestInfo | URL) {
        const hit = store.get(new Request(req).url);
        return hit?.clone();
      },
      async put(req: RequestInfo | URL, res: Response) {
        store.set(new Request(req).url, res);
      },
    },
  };
}

const page = (cacheControl: string, init: ResponseInit = {}) =>
  new Response("<html>", {
    status: 200,
    ...init,
    headers: { "cache-control": cacheControl, ...init.headers },
  });

describe("withEdgeCache", () => {
  it("stores a shared-cacheable page and answers the next GET from the cache", async () => {
    const { cache, store } = memoryCache();
    const pending: Promise<unknown>[] = [];
    const options = {
      cache,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    };
    let renders = 0;
    const render = async () => {
      renders++;
      return page("public, max-age=0, s-maxage=60");
    };
    const req = () => new Request("https://example.com/a");

    await withEdgeCache(req(), render, options);
    await Promise.all(pending);
    expect(store.size).toBe(1);
    const second = await withEdgeCache(req(), render, options);
    expect(renders).toBe(1);
    expect(await second.text()).toBe("<html>");
  });

  it("renders without storing pages a shared cache may not keep", async () => {
    const cases = [
      page("no-store"),
      page("public, s-maxage=60", { status: 404 }),
      page("public, s-maxage=60", { headers: { "set-cookie": "a=1" } }),
    ];
    for (const response of cases) {
      const { cache, store } = memoryCache();
      await withEdgeCache(
        new Request("https://example.com/"),
        async () => response,
        { cache, waitUntil: () => {} },
      );
      expect(store.size).toBe(0);
    }
  });

  it("never caches anything but GET, and renders when there is no cache", async () => {
    const { cache, store } = memoryCache();
    await withEdgeCache(
      new Request("https://example.com/", { method: "POST" }),
      async () => page("s-maxage=60"),
      { cache, waitUntil: () => {} },
    );
    expect(store.size).toBe(0);
    const res = await withEdgeCache(
      new Request("https://example.com/"),
      async () => new Response("rendered"),
    );
    expect(await res.text()).toBe("rendered");
  });

  it("keys by version, so a new build never serves the old one's pages", async () => {
    const { cache, store } = memoryCache();
    const run = (version: string) =>
      withEdgeCache(
        new Request("https://example.com/p"),
        async () => page("s-maxage=60"),
        { cache, version, waitUntil: () => {} },
      );
    await run("b1");
    await run("b2");
    expect([...store.keys()]).toEqual([
      "https://example.com/p?__build=b1",
      "https://example.com/p?__build=b2",
    ]);
  });

  it("strips a browser max-age from a cache hit", async () => {
    const { cache } = memoryCache();
    await cache.put(
      new Request("https://example.com/h"),
      page("max-age=14400, public, s-maxage=60"),
    );
    const hit = await withEdgeCache(
      new Request("https://example.com/h"),
      async () => {
        throw new Error("rendered on a hit");
      },
      { cache },
    );
    expect(hit.headers.get("cache-control")).toBe("public, s-maxage=60");
  });
});

describe("cache headers", () => {
  it("reads s-maxage", () => {
    expect(sharedMaxAge(page("public, s-maxage=300"))).toBe(300);
    expect(sharedMaxAge(page("public, max-age=300"))).toBe(0);
  });

  it("removes only the browser max-age", () => {
    expect(
      withoutBrowserMaxAge(page("public, max-age=5, s-maxage=60")).headers.get(
        "cache-control",
      ),
    ).toBe("public, s-maxage=60");
    const untouched = page("public, s-maxage=60");
    expect(withoutBrowserMaxAge(untouched)).toBe(untouched);
  });
});
