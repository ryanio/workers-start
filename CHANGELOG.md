# Changelog

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
