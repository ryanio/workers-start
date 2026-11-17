/**
 * A Worker entry that sits in front of a TanStack Start handler (or any
 * `{ fetch }` handler) and fixes what Start leaves to the app:
 *
 * - A page request whose Accept header includes text/markdown gets the
 *   Markdown rendering the app provides, on the same URL.
 * - A page request whose Accept header names neither text/html nor *∕* gets
 *   HTML instead of Start's 406.
 * - Page responses of both kinds carry `Vary: Accept`.
 * - Paths under a read-only prefix (default `/api/`) answer any method other
 *   than GET and HEAD with 405, instead of an empty 200 page shell.
 */

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
   * Markdown rendering of a page. Called for GET and HEAD page requests whose
   * Accept header includes text/markdown. Return null to serve HTML instead.
   */
  markdown?: (pathname: string, request: Request) => MaybePromise<MarkdownResult>;
  /** Path prefixes that only accept GET and HEAD. Default `["/api/"]`. Pass `[]` to turn off. */
  readOnlyPrefixes?: string[];
  /**
   * Whether a path is a page (negotiated and given `Vary: Accept`). Default:
   * not under a read-only prefix, not a framework internal (`/_…`, `/@…`), and
   * no file extension on the last segment.
   */
  isPage?: (pathname: string) => boolean;
}

const ACCEPTS_HTML = /(^|,)\s*(\*\/\*|text\/html)/;
const TRAILING_SLASHES = /\/+$/;

export const MARKDOWN_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept",
  // A Markdown body is a second representation of a page, not a page of its own.
  "x-robots-tag": "noindex",
};

export function wantsMarkdown(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("text/markdown");
}

export function defaultIsPage(pathname: string, readOnlyPrefixes: readonly string[] = ["/api/"]): boolean {
  if (readOnlyPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  if (pathname.startsWith("/_") || pathname.startsWith("/@")) {
    return false;
  }
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return !lastSegment.includes(".");
}

/** `/learn/` becomes `/learn`; `/` stays `/`. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(TRAILING_SLASHES, "") || "/" : pathname;
}

function markdownResponse(result: Exclude<MarkdownResult, null | undefined>, head: boolean): Response {
  const { body, status = 200 } = typeof result === "string" ? { body: result } : result;
  return new Response(head ? null : body, { status, headers: MARKDOWN_HEADERS });
}

function withVaryAccept(response: Response): Response {
  if (!response.headers.get("content-type")?.startsWith("text/html")) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.append("vary", "Accept");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function createEntry(options: EntryOptions): {
  fetch(request: Request, ...rest: unknown[]): Promise<Response>;
} {
  const readOnlyPrefixes = options.readOnlyPrefixes ?? ["/api/"];
  const isPage = options.isPage ?? ((pathname: string) => defaultIsPage(pathname, readOnlyPrefixes));

  return {
    async fetch(request, ...rest) {
      const { pathname } = new URL(request.url);
      const isRead = request.method === "GET" || request.method === "HEAD";

      if (!isRead && readOnlyPrefixes.some((prefix) => pathname.startsWith(prefix))) {
        return Response.json({ error: "Method not allowed" }, { status: 405, headers: { allow: "GET, HEAD" } });
      }

      if (!isPage(pathname)) {
        return options.handler.fetch(request, ...rest);
      }

      if (isRead && options.markdown && wantsMarkdown(request)) {
        const result = await options.markdown(normalizePath(pathname), request);
        if (result !== null && result !== undefined) {
          return markdownResponse(result, request.method === "HEAD");
        }
      }

      let pageRequest = request;
      if (isRead && !ACCEPTS_HTML.test(request.headers.get("accept") ?? "*/*")) {
        const headers = new Headers(request.headers);
        headers.set("accept", "text/html");
        pageRequest = new Request(request, { headers });
      }

      return withVaryAccept(await options.handler.fetch(pageRequest, ...rest));
    },
  };
}
