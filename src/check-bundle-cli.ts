#!/usr/bin/env node
/**
 * workers-start-check-bundle [--dist dist] [--root .] [--skip name ...]
 *
 * Exits 1 if any local env value appears in a built file. Run it between the
 * build and the deploy.
 */

import { relative, resolve } from "node:path";
import { checkBundle, DEFAULT_SKIP } from "./check-bundle.js";

function parseArgs(argv: string[]): { dist: string; root: string; skip: string[] } {
  let dist = "dist";
  let root = ".";
  const skip = [...DEFAULT_SKIP];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag === "--dist" || flag === "--root" || flag === "--skip") && value === undefined) {
      throw new Error(`${flag} needs a value`);
    }
    if (flag === "--dist") {
      dist = value as string;
      i++;
    } else if (flag === "--root") {
      root = value as string;
      i++;
    } else if (flag === "--skip") {
      skip.push(value as string);
      i++;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return { dist, root, skip };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root);
  const dist = resolve(root, args.dist);
  const result = checkBundle(root, dist, args.skip);

  if (result.leaked.length === 0) {
    console.log(`  ok  none of ${result.envValues} local env value(s) appear in ${result.files} built file(s)`);
    return;
  }

  console.error(`\nRefusing to ship: the build contains the value of ${result.leaked.length} local secret(s):\n`);
  for (const key of result.leaked) {
    console.error(`  ${key}`);
  }
  console.error(
    `\n  Find where it is read at build time (import.meta.env, define, a module-scope\n  process.env read) under ${relative(process.cwd(), dist) || "."}/ and fix that.\n`,
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
