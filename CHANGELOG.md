# Changelog

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
