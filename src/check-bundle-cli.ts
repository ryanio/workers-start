#!/usr/bin/env node
/**
 * workers-start-check-bundle [--dist dir ...] [--root dir] [--env-dir dir ...] [--skip path ...] [--allow KEY ...] [--public-prefix PREFIX ...]
 *
 * Exits 1 if any local env value appears in a built file. Run it between the
 * build and the deploy.
 */

import { relative, resolve } from "node:path";
import {
  checkBundle,
  DEFAULT_PUBLIC_PREFIXES,
  DEFAULT_SKIP,
} from "./check-bundle.js";

const USAGE = `Usage: workers-start-check-bundle [options]

  --dist <dir>   Build directory to scan, relative to --root. Repeatable. Default: dist
  --root <dir>   Base for the other paths. Default: .
  --env-dir <dir>
                 Directory holding .env and .dev.vars files, relative to --root.
                 Repeatable, for a package and its monorepo root. Default: --root
  --skip <path>  Path inside a build directory that never ships. Repeatable.
                 Always skipped: ${DEFAULT_SKIP.join(", ")}
  --allow <KEY>  Env key whose value is public. Repeatable.
  --public-prefix <PREFIX>
                 Key prefix whose values are public, such as NEXT_PUBLIC_. Repeatable.
                 Always public: ${DEFAULT_PUBLIC_PREFIXES.join(", ")}`;

interface Args {
  dists: string[];
  envDirs: string[];
  root: string;
  skip: string[];
  allow: string[];
  publicPrefixes: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dists: [],
    envDirs: [],
    root: ".",
    skip: [...DEFAULT_SKIP],
    allow: [],
    publicPrefixes: [...DEFAULT_PUBLIC_PREFIXES],
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    const value = argv[i + 1];
    if (
      !(
        flag === "--dist" ||
        flag === "--root" ||
        flag === "--env-dir" ||
        flag === "--skip" ||
        flag === "--allow" ||
        flag === "--public-prefix"
      )
    ) {
      throw new Error(`Unknown argument: ${flag}\n\n${USAGE}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} needs a value`);
    }
    i++;
    if (flag === "--dist") args.dists.push(value);
    else if (flag === "--root") args.root = value;
    else if (flag === "--env-dir") args.envDirs.push(value);
    else if (flag === "--skip") args.skip.push(value.replace(/^\.?\//, ""));
    else if (flag === "--allow") args.allow.push(value);
    else args.publicPrefixes.push(value);
  }
  if (args.dists.length === 0) {
    args.dists.push("dist");
  }
  if (args.envDirs.length === 0) {
    args.envDirs.push(".");
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root);
  const dists = args.dists.map((dist) => resolve(root, dist));
  const envDirs = args.envDirs.map((dir) => resolve(root, dir));
  const result = checkBundle(envDirs, dists, {
    skip: args.skip,
    allow: args.allow,
    publicPrefixes: args.publicPrefixes,
  });

  if (result.leaked.length === 0) {
    console.log(
      `  ok  none of ${result.envValues} local env value(s) appear in ${result.files} built file(s)`,
    );
    return;
  }

  console.error(
    `\nRefusing to ship: the build contains the value of ${result.leaked.length} local secret(s):\n`,
  );
  for (const key of result.leaked) {
    console.error(`  ${key}`);
  }
  const where = dists
    .map((dist) => `${relative(process.cwd(), dist) || "."}/`)
    .join(", ");
  console.error(
    `\n  Find where it is read at build time (import.meta.env, define, a module-scope\n  process.env read) under ${where} and fix that. If the value is meant to be\n  public, pass --allow <KEY> or --public-prefix <PREFIX>.\n`,
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(
    `\n  ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
