#!/usr/bin/env node
/**
 * workers-start-check-bundle [--dist dir ...] [--root dir] [--skip path ...] [--allow KEY ...]
 *
 * Exits 1 if any local env value appears in a built file. Run it between the
 * build and the deploy.
 */

import { relative, resolve } from "node:path";
import { checkBundle, DEFAULT_SKIP } from "./check-bundle.js";

const USAGE = `Usage: workers-start-check-bundle [options]

  --dist <dir>   Build directory to scan, relative to --root. Repeatable. Default: dist
  --root <dir>   Directory holding the .env and .dev.vars files. Default: .
  --skip <path>  Path inside a build directory that never ships. Repeatable.
                 Always skipped: ${DEFAULT_SKIP.join(", ")}
  --allow <KEY>  Env key whose value is public. Repeatable. VITE_* keys are always allowed.`;

interface Args {
  dists: string[];
  root: string;
  skip: string[];
  allow: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dists: [], root: ".", skip: [...DEFAULT_SKIP], allow: [] };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    const value = argv[i + 1];
    if (!(flag === "--dist" || flag === "--root" || flag === "--skip" || flag === "--allow")) {
      throw new Error(`Unknown argument: ${flag}\n\n${USAGE}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} needs a value`);
    }
    i++;
    if (flag === "--dist") args.dists.push(value);
    else if (flag === "--root") args.root = value;
    else if (flag === "--skip") args.skip.push(value.replace(/^\.?\//, ""));
    else args.allow.push(value);
  }
  if (args.dists.length === 0) {
    args.dists.push("dist");
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root);
  const dists = args.dists.map((dist) => resolve(root, dist));
  const result = checkBundle(root, dists, { skip: args.skip, allow: args.allow });

  if (result.leaked.length === 0) {
    console.log(`  ok  none of ${result.envValues} local env value(s) appear in ${result.files} built file(s)`);
    return;
  }

  console.error(`\nRefusing to ship: the build contains the value of ${result.leaked.length} local secret(s):\n`);
  for (const key of result.leaked) {
    console.error(`  ${key}`);
  }
  const where = dists.map((dist) => `${relative(process.cwd(), dist) || "."}/`).join(", ");
  console.error(
    `\n  Find where it is read at build time (import.meta.env, define, a module-scope\n  process.env read) under ${where} and fix that. If the value is meant to be\n  public, pass --allow <KEY>.\n`,
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
