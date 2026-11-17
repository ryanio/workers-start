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

export default createServerEntry(createEntry({ handler, markdown: renderMarkdown }));
```

Point `main` in `wrangler.jsonc` at this file (`"main": "./src/server.ts"`). Pointing it at `@tanstack/react-start/server-entry` skips your entry without an error.

What it does to each request:

| Request                                           | Response                                                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page, `Accept: text/markdown`                     | Your `markdown(path)` result as `text/markdown`, with `Vary: Accept` and `X-Robots-Tag: noindex`. Return a string, `{ body, status }`, or `null` to serve HTML. |
| Page, Accept names neither HTML nor `*/*`         | HTML, not 406                                                                                                                                                   |
| Any HTML page                                     | `Vary: Accept` added                                                                                                                                            |
| Non-GET/HEAD under `/api/`                        | 405 with `Allow: GET, HEAD`                                                                                                                                     |
| API routes, files with an extension, `/_…`, `/@…` | Passed through untouched                                                                                                                                        |

`readOnlyPrefixes` and `isPage` change which paths count as API and which as pages.

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
  head: () => pageHead({ title: "About", description: "Who we are.", path: "/about" }),
  component: About,
});
```

It returns the title, description, canonical link, Open Graph tags and Twitter tags. `type: "article"` with `published` and `modified` adds the article dates. `noindex: true` adds a robots tag.

Two tags with the same name, like the light and dark `theme-color`, can't go through `head()`, because the router keeps only one. Write them straight into the root document.

## Workers bindings

`workers-start/workers` reaches `cloudflare:workers` lazily, so the same module works in the Worker, in vitest and in the client bundle.

```ts
import { afterResponse, getBinding, getEnvString, isKvNamespace } from "workers-start/workers";

const kv = await getBinding("CACHE_KV", isKvNamespace); // null outside workerd
const key = await getEnvString("API_KEY"); // Worker env, then process.env
await afterResponse(refreshCache()); // waitUntil in workerd, awaited elsewhere
```

In tests, `setWorkersModule({ env, waitUntil })` stands in for the runtime.

## Inline scripts

`workers-start/scripts` returns strings for `dangerouslySetInnerHTML` in the root document.

- `themeScript()` applies a stored `light` or `dark` choice before first paint. With nothing stored it does nothing, and `color-scheme: light dark` follows the OS.
- `analyticsScript({ measurementId, hosts })` loads GA4 only on the listed hostnames, so local dev and preview deploys never report.

## Secret check

Run it between the build and the deploy:

```json
"deploy": "vite build && workers-start-check-bundle && wrangler deploy"
```

It reads every value in your local `.env*` and `.dev.vars*` files and fails if any of them appears in a built file. It skips `dist/server/.dev.vars`, which wrangler never uploads. Flags: `--dist <dir>` (default `dist`; `out` for a static site), `--root <dir>`, `--skip <filename>`.

## Biome preset

```jsonc
// biome.jsonc
{ "extends": ["workers-start/biome"] }
```

Biome's recommended rules, Tailwind directives in CSS, sorted imports and JSX attributes, and file-name rules off under `src/routes`, where names like `$slug.tsx` and `robots[.]txt.ts` are routing syntax.

## License

MIT
