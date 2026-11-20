# Changelog

## 0.7.0 (2026-11-20)

- `workers-start/cache`: `withEdgeCache(request, render, { version })` keeps rendered pages in the Workers Cache API by their `s-maxage`, with `sharedMaxAge` and `withoutBrowserMaxAge`.
- `workers-start/scripts`: `gaEvent(name, params)` sends an analytics event through `gtag` or a Tag Manager `dataLayer`, and does nothing where neither loaded.
- `workers-start/check-bundle` no longer exports its internal helpers (`MIN_SECRET_LENGTH`, `encodings`, `localEnvPairs`, `listFiles`, `readBuilt`). They were never documented and no consumer imported them; the bin and `DEFAULT_SKIP`/`DEFAULT_PUBLIC_PREFIXES` are unchanged.
- README: an index of every entry point.

## 0.6.1 (2026-11-20)

- `inlineJson` also escapes `>` and `&`, so every inline script the package builds escapes the same five characters. The output still parses to the same value.
- `jsonLdScript` escapes its body with `inlineJson` instead of a copy of the same rules. Its output is unchanged.

## 0.6.0 (2026-11-20)

Additions only. Output for existing options is unchanged.

- `workers-start/seo`: `sitemapXml(entries)` and `robotsTxt({ rules, host, sitemap })` for `/sitemap.xml` and `/robots.txt` routes. Sitemap URLs are XML-escaped.
- `workers-start/entry`: `withHeaders(response, headers, { overwrite })`, a copy of a response with headers added, for site-wide security headers.
- The root entry point exports `tagManagerScript`, which 0.5.0 added only to `workers-start/scripts`.

## 0.5.0 (2026-11-19)

- `workers-start/scripts`: `tagManagerScript({ containerId, hosts })`, a Google Tag Manager bootstrap with the same host, path and consent gates as `analyticsScript`.

## 0.4.0 (2026-11-17)

- Removed the `workers-start/biome` preset. A Workers helper library is the wrong place for a lint opinion, and once it shrank to Biome's defaults there was little left to share. Apps that extended it put the few lines they need in their own `biome.jsonc`: `vcs.useIgnoreFile`, `formatter.indentStyle: "space"`, `css.parser.tailwindDirectives` if they use Tailwind, and the rules they want on top of `recommended`.

## 0.3.0 (2026-11-17)

Additions only. Output for existing options is unchanged.

- Secret check: `--env-dir <dir>` (repeatable) reads env files from several directories, such as a package and its monorepo root. `checkBundle` and `localEnvPairs` take a directory or an array of them.
- Head: site-wide `robots`, `keywords`, `authors` and `meta` defaults that a page can override, and `defaultImage` as an object with size, alt and type.
- Head: `alternates` (hreflang or feed links), `links`, `section` (`article:section`) and `jsonLd`, which returns a `scripts` entry. `jsonLdScript` is exported for the root route.
- Entry: the Markdown renderer gets `page.html()`, the page rendered through the handler as HTML, for renderers that convert the page.

## 0.2.1 (2026-11-17)

- Secret check: `--public-prefix <PREFIX>` marks a family of keys as public, such as `NEXT_PUBLIC_` in an app that kept its Next.js names.

## 0.2.0 (2026-11-17)

Fixes from a review of 0.1. Several change responses, so compare an app against production after upgrading.

- Entry: Accept is parsed with q-values and case-insensitive types. `text/markdown;q=0` and `text/html, text/markdown;q=0.1` now get HTML.
- Entry: paths are decoded and normalized before every rule, and prefixes match by segment ignoring case. `POST /API/x` and `POST /%61pi/x` were reaching the handler; they now get 405. The default prefix is `/api`, which also covers `/api` itself.
- Entry: OPTIONS under a read-only prefix gets 204 instead of 405.
- Entry: with `markdown` set, `Vary: Accept` goes on every page response (redirects included) and is merged, not duplicated.
- Entry: dotted slugs like `/blog/node.js-tips` are pages; only known file extensions are not. `/@handle` paths are pages.
- Entry: a renderer that throws falls back to HTML; 204 and 304 results have no body. `markdown()` receives the decoded path.
- Head: `absoluteUrl` resolves relative paths, protocol-relative and upper-case URLs correctly. New: `image` as an object with type, size and alt; `authors`, `tags`, `keywords`, `robots`, `canonical` (override or `false`), `meta`; `twitterSite`; `twitter:image:alt`.
- Scripts: values are escaped so none can close the script tag; hosts compare without case. New: `target: { class: true }` and `followSystem` for the theme, `skipPaths` and `consentCookie` for analytics.
- Workers: `cloudflare:workers` loads under `@cloudflare/vitest-pool-workers`; `afterResponse` logs a failure outside workerd instead of throwing; `isKvNamespace` no longer accepts an R2 bucket.
- Secret check: dotenv parsing (inline comments, multi-line and escaped values), encoded copies, `.gz`/`.br` files, symlinks skipped, `--skip` by path inside the build, repeatable `--dist`, `--allow`, `VITE_*` ignored, `.tpl` files and `op://` references ignored.
- Package: `default` export condition and `./package.json`; Node 22 or later; the Biome preset drops a routes override that did nothing.

## 0.1.1 (2026-11-17)

The same code as 0.1.0, published from GitHub Actions through trusted publishing with a provenance statement. 0.1.0 was published by hand.

## 0.1.0 (2026-11-17)

First release, extracted from sites moved from Next.js to TanStack Start on Workers.

- `workers-start/entry`: `createEntry`, with Markdown on the same URL for `Accept: text/markdown`, HTML instead of 406 for other Accept values, `Vary: Accept` on pages, and 405 for writes under `/api/`.
- `workers-start/head`: `createPageHead`, a full title, canonical, Open Graph and Twitter set per page.
- `workers-start/workers`: lazy `cloudflare:workers` bindings, env and `waitUntil`.
- `workers-start/scripts`: `themeScript` and `analyticsScript`.
- `workers-start-check-bundle`: fails a deploy when a local env value appears in a built file.
- `workers-start/biome`: shared Biome preset.
