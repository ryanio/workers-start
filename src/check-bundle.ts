/**
 * Finds local secrets compiled into a build.
 *
 * Reads every value in the local `.env*` and `.dev.vars*` files (examples
 * excluded) and searches the built files for each one. A match means a key
 * reached something that ships, whichever tool put it there.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Values shorter than this are flags or placeholders, not secrets. */
export const MIN_SECRET_LENGTH = 12;

const ENV_FILE = /^(\.env(\..+)?|\.dev\.vars(\..+)?)$/;
const EXAMPLE_FILE = /\.example$/;
const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
const QUOTED = /^(['"])(.*)\1$/;

/** `.dev.vars` copies the Cloudflare Vite plugin writes for `vite preview`; wrangler never uploads them. */
export const DEFAULT_SKIP = [".dev.vars"];

/** KEY=value pairs from a dotenv-style file, quotes stripped. */
export function parseEnvFile(source: string): [string, string][] {
  const pairs: [string, string][] = [];
  for (const line of source.split("\n")) {
    const match = line.match(ENV_LINE);
    if (!(match?.[1] && match[2] !== undefined)) {
      continue;
    }
    pairs.push([match[1], match[2].replace(QUOTED, "$2")]);
  }
  return pairs;
}

/** The env keys whose values appear in any of the given file contents. */
export function leakedKeys(pairs: [string, string][], contents: string[]): string[] {
  const leaked = new Set<string>();
  for (const [key, value] of pairs) {
    if (value.length >= MIN_SECRET_LENGTH && contents.some((text) => text.includes(value))) {
      leaked.add(key);
    }
  }
  return [...leaked].sort();
}

/** Every KEY=value pair in the local env files of `dir`. */
export function localEnvPairs(dir: string): [string, string][] {
  return readdirSync(dir)
    .filter((name) => ENV_FILE.test(name) && !EXAMPLE_FILE.test(name))
    .flatMap((name) => parseEnvFile(readFileSync(join(dir, name), "utf8")));
}

/** Every file under `dir`, recursively, minus names in `skip`. */
export function listFiles(dir: string, skip: readonly string[] = DEFAULT_SKIP): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path, skip));
    } else if (!skip.includes(name)) {
      files.push(path);
    }
  }
  return files;
}

export interface CheckResult {
  envValues: number;
  files: number;
  leaked: string[];
}

export function checkBundle(root: string, dist: string, skip: readonly string[] = DEFAULT_SKIP): CheckResult {
  if (!existsSync(dist)) {
    throw new Error(`${dist} does not exist. Build first.`);
  }
  const pairs = localEnvPairs(root);
  const files = listFiles(dist, skip);
  const leaked = leakedKeys(
    pairs,
    files.map((path) => readFileSync(path, "latin1")),
  );
  return { envValues: pairs.length, files: files.length, leaked };
}
