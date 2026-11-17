# workers-start

The parts every TanStack Start app on Cloudflare Workers ends up writing by hand.

It has no runtime dependencies. Each piece is its own entry point, so an app takes only what it uses.

## Why

This came out of moving my sites from Next.js on OpenNext to TanStack Start on Workers. Each migration hit the same problems, and each app had started to solve them its own way:

- Start answers a page request with 406 unless the Accept header allows HTML. Next served those clients HTML, so moving breaks any crawler or agent that asks for something else.
- A server route with no handler for a method renders an empty 200 page shell instead of 405, so a `POST` to a GET-only API looks like it worked.
- Agents increasingly ask for `Accept: text/markdown`. Serving Markdown on the same URL is easy to get half right: the Markdown response says `Vary: Accept` and the HTML one doesn't, so a cache can hand one to the other.
- The router keeps one `<meta>` per name, deepest route winning. A page that sets its title but not its Twitter tags quietly shares the homepage's card. Under Next, three pages on one of these sites were already shipping the homepage's Twitter card, from the same kind of merge.
- `cloudflare:workers` only resolves inside workerd. Import it at the top of a module the client bundle or vitest also loads, and the build or the tests break.
- The Cloudflare Vite plugin copies your local env into `dist/server/.dev.vars` for `vite preview`. wrangler doesn't upload it, but nothing checks that no local secret reached a file that does ship.

## Install

```sh
npm install workers-start
```

## Worker entry

`workers-start/entry` wraps the Start handler.

```ts
// src/server.ts
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { createEntry } from "workers-start/entry";
import { renderMarkdown } from "./markdown";

export default createServerEntry(
  createEntry({ handler, markdown: renderMarkdown }),
);
```

Point `main` in `wrangler.jsonc` at this file (`"main": "./src/server.ts"`). Pointing it at `@tanstack/react-start/server-entry` skips your entry without an error.

What it does to each request:

| Request                                                            | Response                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page, Accept prefers `text/markdown`                               | Your `markdown(path)` result as `text/markdown` with `X-Robots-Tag: noindex`. Return a string, `{ body, status }`, or `null` to serve HTML. If it throws, the error is logged and HTML is served. |
| Page, Accept rules out HTML                                        | HTML, not 406                                                                                                                                                                                     |
| Any page, with `markdown` set                                      | `Vary: Accept`, merged into any `Vary` already there, on HTML, redirects and Markdown alike                                                                                                       |
| OPTIONS under `/api`                                               | 204 with `Allow: GET, HEAD, OPTIONS`                                                                                                                                                              |
| Anything but GET, HEAD or OPTIONS under `/api`                     | 405 with the same `Allow`                                                                                                                                                                         |
| Other API requests, files with an extension, `/_…`, Vite dev paths | Passed through untouched                                                                                                                                                                          |

Details that matter when you compare against production:

- Accept is parsed with q-values. Markdown is served only when the client names `text/markdown` with q > 0 and rates it at least as high as HTML, so `text/markdown;q=0` and `*/*` both get HTML.
- Paths are decoded, repeated slashes collapsed and trailing slashes dropped before any test, and prefixes match whole segments ignoring case. `/API/x`, `/%61pi/x` and `//api//x` all count as `/api`; `/apiary` does not. `markdown()` receives that normalized path, so `/learn/caf%C3%A9/` arrives as `/learn/café`.
- A page is any path whose last segment has no file extension like `.js`, `.xml` or `.txt`. A dotted slug such as `/blog/node.js-tips` is still a page.
- `readOnlyPrefixes` (default `["/api"]`, `[]` to turn off) and `isPage` change those rules. An API that accepts writes, or that needs CORS headers on preflight, should pass `readOnlyPrefixes: []` and answer those methods itself.
- `markdown(path, request, page)` gets a third argument: `await page.html()` renders the same request through the handler as HTML (extra fetch arguments passed through), for a renderer that converts the page rather than building Markdown from data.
- Static assets are served before the Worker runs. On a prerendered site, or a static site on Pages, none of this applies to the prerendered pages unless `assets.run_worker_first` sends them through the Worker.

## Head tags

`workers-start/head` writes a full head set for every page, so nothing inherits the homepage's share card.

```ts
// lib/seo.ts
import { createPageHead } from "workers-start/head";

export const { pageHead } = createPageHead({
  url: "https://example.com",
  name: "Example",
  defaultImage: "/og/main.png",
  twitterCreator: "@example",
});

// src/routes/about.tsx
export const Route = createFileRoute("/about")({
  head: () =>
    pageHead({ title: "About", description: "Who we are.", path: "/about" }),
  component: About,
});
```

It returns the title, description, canonical link, Open Graph tags and Twitter tags. Optional fields add the rest: `image` as a path or `{ url, width, height, alt, type }`; `type: "article"` with `published`, `modified`, `authors` and `tags`; `keywords`; `robots` (or `noindex: true`); `canonical` to override it or `false` to drop it; `meta` for anything else; `alternates` for `rel="alternate"` links (`{ href, hreflang }` for a language version, `{ href, type, title }` for a feed); `links` for any other link; `section` for `article:section`; and `jsonLd` for schema.org data.

The site config takes `twitterSite` and `twitterCreator`, a `defaultImage` as a path or an object, and defaults every page can override: `robots`, `keywords`, `authors` (`[{ name, url }]`, written as `author` meta and `rel="author"` links) and `meta` (a page tag with the same name or property replaces the site's).

`jsonLd` takes one schema.org object or an array, which becomes an `@graph`, and adds `@context` when it is missing. It comes back as `scripts`, which TanStack Router's `head()` renders. The same serializer is exported as `jsonLdScript(data)` for the root route's `scripts`. Both escape `<`, `>` and `&`, so no value can close the script tag.

Call `pageHead` from leaf routes only. The router keeps one meta per name with the deepest route winning, so a tag a leaf leaves out falls back to its parent's, and it concatenates links, so a canonical from a layout and a leaf would appear twice.

Two tags with the same name, like the light and dark `theme-color`, can't go through `head()`, because the router keeps only one. Write them straight into the root document.

## Workers bindings

`workers-start/workers` reaches `cloudflare:workers` lazily, so the same module works in the Worker, in vitest and in the client bundle.

```ts
import {
  afterResponse,
  getBinding,
  getEnvString,
  isKvNamespace,
} from "workers-start/workers";

const kv = await getBinding("CACHE_KV", isKvNamespace); // null outside workerd
const key = await getEnvString("API_KEY"); // Worker env, then process.env
await afterResponse(refreshCache()); // waitUntil in workerd, awaited elsewhere
```

In tests, `setWorkersModule({ env, waitUntil })` stands in for the runtime. Under `@cloudflare/vitest-pool-workers` the real module loads. Outside workerd, a failure in `afterResponse` work is logged rather than thrown, as `waitUntil` would.

## Inline scripts

`workers-start/scripts` returns strings for `dangerouslySetInnerHTML` in the root document.

- `themeScript()` applies a stored `light` or `dark` choice before first paint, as a `data-theme` attribute by default or as a class with `target: { class: true }`. With nothing stored it does nothing, and `color-scheme: light dark` follows the OS; `followSystem: true` applies the OS choice instead, for CSS keyed off the class.
- `analyticsScript({ measurementId, hosts })` loads GA4 only on the listed hostnames, so local dev and preview deploys never report. `skipPaths` keeps it off paths like `/admin`, and `consentCookie` waits for a consent cookie.

Every value is embedded with `inlineJson`, which escapes `<`, so no option can close the script tag.

## Secret check

Run it between the build and the deploy:

```json
"deploy": "vite build && workers-start-check-bundle && wrangler deploy"
```

It reads every value in your local `.env*` and `.dev.vars*` files (not `.example` or `.tpl` templates, and not `op://` references) and fails if any of them appears in a built file. It parses dotenv the way dotenv does, and searches for each value raw, URL-encoded, JSON-escaped and base64-encoded, inside `.gz` and `.br` files too. Symlinks are skipped. `VITE_*` keys are public by design and ignored.

It skips `server/.dev.vars` inside the build directory, which wrangler never uploads. Flags: `--dist <dir>` (repeatable; default `dist`, `out` for a static site), `--root <dir>` (the base the other paths resolve against), `--env-dir <dir>` (repeatable; where the env files are, default `--root`; in a monorepo package, `--env-dir . --env-dir ../..` reads the package's and the root's), `--skip <path inside the build>`, `--allow <KEY>` for another public value, `--public-prefix <PREFIX>` for a whole family of them (for example `NEXT_PUBLIC_` in an app that kept its Next.js variable names).

## License

MIT
