# AGENTS.md

`workers-start` is a TypeScript library of helpers for TanStack Start apps on Cloudflare Workers. The README is the user guide. This file is for agents changing the package.

## Layout

- `src/accept.ts`: Accept parsing with q-values.
- `src/entry.ts`: `createEntry`, the Worker entry wrapper (Markdown negotiation, Accept normalization, `Vary: Accept`, 204 and 405 on read-only prefixes).
- `src/head.ts`: `createPageHead`.
- `src/workers.ts`: lazy `cloudflare:workers` access.
- `src/scripts.ts`: inline theme and analytics bootstraps.
- `src/check-bundle.ts`, `src/check-bundle-cli.ts`: the secret check and its `workers-start-check-bundle` bin.
- `test/`: Node tests. The CLI and package tests run the built `dist/`, so `npm test` builds first.

## Rules

- No runtime dependencies. Only `check-bundle*` may import `node:` modules; every other entry point runs in workerd and the browser.
- Nothing imports `cloudflare:workers` statically. `src/workers.ts` imports it through a variable specifier.
- Every new behavior gets a test that fails without it. Follow the `test-audit` skill where it is installed.
- Changing a response header, status or default path rule is a breaking change for apps that compared their output against production. That is a major version with a CHANGELOG note.
- Prose in docs and comments: plain words, no em or en dashes, no hype words.

## Commands

```bash
npm install
npm run check   # biome, tsc, build, tests
npm test        # build, then tests
npm pack        # builds dist/ and writes the tarball
```

## Releases

A release is a version bump on main. `.github/workflows/release.yml` runs on every push that changes `package.json`: when that version is not on npm, it runs the gate, publishes through npm trusted publishing (GitHub environment `npm`, no token anywhere, provenance attached), tags the commit `v<version>` and opens a GitHub release from the version's CHANGELOG section.

1. Bump `version` in `package.json` and add a dated `## <version> (YYYY-MM-DD)` section to `CHANGELOG.md`.
2. Run `npm run check`, commit both and push to main.

Never tag by hand or run `npm publish` locally.

## Shared with workers-jobs

`.github/workflows/release.yml`, `.github/workflows/ci.yml`, `biome.json` and `.gitignore` are byte-identical with [`workers-jobs`](https://github.com/ryanio/workers-jobs) (`~/dev/workers-jobs`). Change them in both repos in the same sitting and check with `cmp`. `release.yml` reads the package name from `package.json`, so it needs no edits to move between them.
