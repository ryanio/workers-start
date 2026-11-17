# AGENTS.md

`workers-start` is a TypeScript library of helpers for TanStack Start apps on Cloudflare Workers. The README is the user guide. This file is for agents changing the package.

## Layout

- `src/entry.ts`: `createEntry`, the Worker entry wrapper (Markdown negotiation, Accept normalization, `Vary: Accept`, 405 on read-only prefixes).
- `src/head.ts`: `createPageHead`.
- `src/workers.ts`: lazy `cloudflare:workers` access.
- `src/scripts.ts`: inline theme and analytics bootstraps.
- `src/check-bundle.ts`, `src/check-bundle-cli.ts`: the secret check and its `workers-start-check-bundle` bin.
- `biome.preset.json`: the shared Biome config, exported as `workers-start/biome`. `biome.json` is this repo's own config.
- `test/`: Node tests. The CLI test runs the built `dist/` file, so `npm test` builds first.

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

Releases publish from GitHub Actions through npm trusted publishing (`.github/workflows/release.yml`, GitHub environment `npm`). There is no npm token anywhere.

1. Bump `version` in `package.json` and add a dated section to `CHANGELOG.md`.
2. Run `npm run check`, commit and push to main.
3. Tag and push: `git tag v<version> && git push origin v<version>`. The workflow checks the tag against `package.json`, runs the gate and publishes with provenance.
