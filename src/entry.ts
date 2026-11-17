/**
 * A Worker entry that sits in front of a TanStack Start handler (or any
 * `{ fetch }` handler) and fixes what Start leaves to the app:
 *
 * - A page request that prefers text/markdown gets the Markdown rendering the
 *   app provides, on the same URL.
 * - A page request whose Accept header rules out HTML gets HTML anyway,
 *   instead of Start's 406.
 * - When Markdown is on, every page response carries `Vary: Accept`.
 * - Paths under a read-only prefix (default `/api`) answer OPTIONS with 204
 *   and anything other than GET, HEAD and OPTIONS with 405, instead of an
 *   empty 200 page shell.
 */

import { parseAccept, quality } from "./accept.js";

type MaybePromise<T> = T | Promise<T>;

/** What a Markdown renderer returns: a body, a body with a status, or null to serve HTML. */
export type MarkdownResult = string | { body: string; status?: number } | null | undefined;

export interface FetchHandler {
  // biome-ignore lint/suspicious/noExplicitAny: handlers pass framework-specific extra arguments through.
  fetch(request: Request, ...rest: any[]): MaybePromise<Response>;
}

export interface EntryOptions {
  /** The framework handler, usually the default export of `@tanstack/react-start/server-entry`. */
  handler: FetchHandler;
  /**
   * Markdown rendering of a page. Called for GET and HEAD page requests that
   * prefer text/markdown, with the decoded path, no trailing slash. Return
   * null to serve HTML instead. If it throws, the error is logged and HTML is
   * served.
   */
  markdown?: (path: string, request: Request) => MaybePromise<MarkdownResult>;
  /**
   * Path prefixes that only accept GET, HEAD and OPTIONS. Matched by segment,
   * case-insensitively, after decoding: `/api` covers `/api`, `/api/x` and
   * `/API/x`, not `/apiary`. Default `["/api"]`. Pass `[]` to turn off.
   */
  readOnlyPrefixes?: string[];
  /** Whether a path is a page. Receives the normalized path. Default: {@link defaultIsPage}. */
  isPage?: (path: string) => boolean;
}

/** Last-segment extensions that mark a file rather than a page. */
const FILE_EXTENSION =
  /\.(?:js|mjs|cjs|css|map|json|xml|txt|md|csv|ico|png|jpe?g|gif|svg|webp|avif|bmp|woff2?|ttf|otf|eot|pdf|mp[34]|webm|wav|ogg|zip|gz|br|wasm|webmanifest|html?|rss|atom)$/i;
const DEV_INTERNALS = ["/@vite/", "/@fs/", "/@id/", "/@react-refresh", "/node_modules/"];
const DUPLICATE_SLASHES = /\/{2,}/g;
const TRAILING_SLASHES = /\/+$/;

export const MARKDOWN_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept",
  // A Markdown body is a second representation of a page, not a page of its own.
  "x-robots-tag": "noindex",
});

/**
 * True when the client names text/markdown with q > 0 and rates it at least
 * as high as HTML. Wildcards alone never select Markdown.
 */
export function wantsMarkdown(request: Request): boolean {
  const ranges = parseAccept(request.headers.get("accept"));
  const markdown = quality(ranges, "text/markdown", { exactOnly: true });
  return markdown > 0 && markdown >= quality(ranges, "text/html");
}

export function acceptsHtml(request: Request): boolean {
  return quality(parseAccept(request.headers.get("accept")), "text/html") > 0;
}

/**
 * Decodes the path, collapses repeated slashes and drops trailing ones:
 * `/learn//caf%C3%A9/` becomes `/learn/café`. `/` stays `/`. A path that is
 * not valid percent-encoding is returned with only the slash fixes.
 */
export function normalizePath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes: match on the raw path.
  }
  path = path.replace(DUPLICATE_SLASHES, "/");
  return path.length > 1 ? path.replace(TRAILING_SLASHES, "") || "/" : path;
}

/** Whether `path` sits under `prefix`, by whole segments and ignoring case. */
export function underPrefix(path: string, prefix: string): boolean {
  const p = path.toLowerCase();
  const base = prefix.toLowerCase().replace(TRAILING_SLASHES, "");
  return base === "" || p === base || p.startsWith(`${base}/`);
}

/**
 * Default page test: not under a read-only prefix, not a Start or Vite
 * internal (`/_…`, `/@vite/…` and similar), and no file extension such as
 * `.js` or `.xml` on the last segment. A dotted slug like `/blog/node.js-tips`
 * is still a page.
 */
export function defaultIsPage(path: string, readOnlyPrefixes: readonly string[] = ["/api"]): boolean {
  if (readOnlyPrefixes.some((prefix) => underPrefix(path, prefix))) {
    return false;
  }
  if (path.startsWith("/_") || DEV_INTERNALS.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  return !FILE_EXTENSION.test(path);
}

/** Appends `token` to a Vary header value unless it is already there or the value is `*`. */
export function mergeVary(existing: string | null, token: string): string {
  if (!existing?.trim()) {
    return token;
  }
  const tokens = existing.split(",").map((t) => t.trim().toLowerCase());
  if (tokens.includes("*") || tokens.includes(token.toLowerCase())) {
    return existing;
  }
  return `${existing}, ${token}`;
}

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

function markdownResponse(result: Exclude<MarkdownResult, null | undefined>, head: boolean): Response {
  const { body, status = 200 } = typeof result === "string" ? { body: result } : result;
  const noBody = head || NULL_BODY_STATUS.has(status);
  return new Response(noBody ? null : body, { status, headers: MARKDOWN_HEADERS });
}

function withVaryAccept(response: Response): Response {
  const vary = mergeVary(response.headers.get("vary"), "Accept");
  if (vary === response.headers.get("vary")) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("vary", vary);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function createEntry(options: EntryOptions): {
  fetch(request: Request, ...rest: unknown[]): Promise<Response>;
} {
  const readOnlyPrefixes = options.readOnlyPrefixes ?? ["/api"];
  const isPage = options.isPage ?? ((path: string) => defaultIsPage(path, readOnlyPrefixes));

  return {
    async fetch(request, ...rest) {
      const path = normalizePath(new URL(request.url).pathname);
      const method = request.method.toUpperCase();
      const isRead = method === "GET" || method === "HEAD";

      if (readOnlyPrefixes.some((prefix) => underPrefix(path, prefix))) {
        if (method === "OPTIONS") {
          return new Response(null, { status: 204, headers: { allow: "GET, HEAD, OPTIONS" } });
        }
        if (!isRead) {
          return Response.json(
            { error: "Method not allowed" },
            { status: 405, headers: { allow: "GET, HEAD, OPTIONS" } },
          );
        }
        return options.handler.fetch(request, ...rest);
      }

      if (!(isRead && isPage(path))) {
        return options.handler.fetch(request, ...rest);
      }

      if (options.markdown && wantsMarkdown(request)) {
        try {
          const result = await options.markdown(path, request);
          if (result !== null && result !== undefined) {
            return markdownResponse(result, method === "HEAD");
          }
        } catch (error) {
          console.error("workers-start: markdown renderer failed, serving HTML", error);
        }
      }

      let pageRequest = request;
      if (!acceptsHtml(request)) {
        const headers = new Headers(request.headers);
        headers.set("accept", "text/html");
        pageRequest = new Request(request, { headers });
      }

      const response = await options.handler.fetch(pageRequest, ...rest);
      return options.markdown ? withVaryAccept(response) : response;
    },
  };
}
