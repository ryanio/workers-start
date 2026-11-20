/**
 * An edge page cache on the Workers Cache API. A Worker on a custom domain runs
 * ahead of the zone cache, so a zone Cache Rule never sees its pages; this
 * keeps rendered pages in the data center's cache instead.
 *
 * A GET 200 whose Cache-Control carries `s-maxage` and sets no cookie is
 * stored for that long, keyed by URL (plus `version`, when given), and later
 * GETs for the same URL are answered from the cache without rendering. Outside
 * workerd, or with no `waitUntil`, every request renders.
 */

import { afterResponse } from "./workers.js";

export interface EdgeCacheOptions {
  /**
   * Added to the cache key, so a deploy never serves a page cached by the
   * previous build (whose HTML names asset files the deploy deleted). Pass a
   * build id or version.
   */
  version?: string;
  /**
   * The Cache to use. Default `caches.default`. Tests pass a stand-in.
   */
  cache?: Pick<Cache, "match" | "put">;
  /**
   * Schedules the store after the response. Default `afterResponse` from
   * `workers-start/workers`, which uses the request's `waitUntil` in workerd.
   */
  waitUntil?: (work: Promise<unknown>) => void;
}

const S_MAXAGE = /(?:^|,)\s*s-maxage=(\d+)/;
const BROWSER_MAX_AGE = /(^|,)\s*max-age=\d+\s*(,|$)/;

/** Seconds a shared cache may keep this response (`s-maxage`), or 0. */
export function sharedMaxAge(response: Response): number {
  const match = response.headers.get("cache-control")?.match(S_MAXAGE);
  return match ? Number(match[1]) : 0;
}

/**
 * A copy of `response` without a browser `max-age`. A response read back from
 * the Cache API carries the zone's Browser Cache TTL as `max-age`, and a
 * browser holding page HTML that long outlives the next deploy.
 */
export function withoutBrowserMaxAge(response: Response): Response {
  const cacheControl = response.headers.get("cache-control");
  if (!(cacheControl && BROWSER_MAX_AGE.test(cacheControl))) return response;
  const headers = new Headers(response.headers);
  headers.set(
    "Cache-Control",
    cacheControl
      .replace(BROWSER_MAX_AGE, (_m, before, after) =>
        before && after ? "," : "",
      )
      .trim(),
  );
  return new Response(response.body, { status: response.status, headers });
}

function defaultCache(): Pick<Cache, "match" | "put"> | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

/**
 * Answers a GET from the edge cache, or renders and stores the page when its
 * Cache-Control allows a shared cache to keep it.
 */
export async function withEdgeCache(
  request: Request,
  render: () => Promise<Response>,
  options: EdgeCacheOptions = {},
): Promise<Response> {
  const cache = options.cache ?? defaultCache();
  if (!cache || request.method !== "GET") return render();

  const keyUrl = new URL(request.url);
  if (options.version) keyUrl.searchParams.set("__build", options.version);
  const key = new Request(keyUrl.toString(), { method: "GET" });

  const hit = await cache.match(key);
  if (hit) return withoutBrowserMaxAge(hit);

  const response = await render();
  if (
    response.status === 200 &&
    sharedMaxAge(response) > 0 &&
    !response.headers.has("set-cookie")
  ) {
    const store = cache.put(key, response.clone());
    if (options.waitUntil) options.waitUntil(store);
    else void afterResponse(store);
  }
  return response;
}
