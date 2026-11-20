/**
 * Finds local secrets compiled into a build.
 *
 * Reads every value in the local `.env*` and `.dev.vars*` files (examples and
 * `.tpl` templates excluded) and searches the built files for each one, raw
 * and in the encodings a bundler or a URL would give it. A match means a key
 * reached something that ships, whichever tool put it there.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

/** Values shorter than this are flags or placeholders, not secrets. */
const MIN_SECRET_LENGTH = 12;

/**
 * Paths, relative to a build directory, that are never uploaded: the copy of
 * the local env the Cloudflare Vite plugin writes for `vite preview`.
 */
export const DEFAULT_SKIP = ["server/.dev.vars"];

/** Keys Vite inlines on purpose; their values are public. */
export const DEFAULT_PUBLIC_PREFIXES = ["VITE_"];

const ENV_FILE = /^(\.env(\..+)?|\.dev\.vars(\..+)?)$/;
const NOT_SECRETS = /\.(example|sample|template|tpl)$/;
const KEY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;
const INLINE_COMMENT = /\s+#.*$/;
const ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  '"': '"',
  "\\": "\\",
};

/**
 * KEY=value pairs from a dotenv file, parsed the way dotenv does: `#`
 * comments, inline ` #` comments on unquoted values, single quotes taken
 * literally, double quotes with `\n` escapes and multi-line values.
 */
export function parseEnvFile(source: string): [string, string][] {
  const pairs: [string, string][] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = (lines[i] ?? "").match(KEY);
    if (!(match?.[1] && match[2] !== undefined)) {
      continue;
    }
    const key = match[1];
    let raw = match[2].trim();
    const quote = raw[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      // Gather lines until the closing quote, for multi-line values.
      let body = raw.slice(1);
      while (!hasClosingQuote(body, quote) && i + 1 < lines.length) {
        i++;
        body += `\n${lines[i]}`;
      }
      const end = closingQuoteIndex(body, quote);
      raw = end === -1 ? body : body.slice(0, end);
      pairs.push([
        key,
        quote === '"'
          ? raw.replace(/\\(.)/g, (m, c: string) => ESCAPES[c] ?? m)
          : raw,
      ]);
    } else {
      pairs.push([key, raw.replace(INLINE_COMMENT, "").trim()]);
    }
  }
  return pairs;
}

function closingQuoteIndex(body: string, quote: string): number {
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && quote === '"') {
      i++;
    } else if (body[i] === quote) {
      return i;
    }
  }
  return -1;
}

function hasClosingQuote(body: string, quote: string): boolean {
  return closingQuoteIndex(body, quote) !== -1;
}

/** The forms a value can take once it is in a bundle or a URL. */
function encodings(value: string): string[] {
  const forms = new Set([
    value,
    encodeURIComponent(value),
    JSON.stringify(value).slice(1, -1),
    Buffer.from(value).toString("base64").replace(/=+$/, ""),
    Buffer.from(value).toString("base64url").replace(/=+$/, ""),
  ]);
  return [...forms].filter((form) => form.length >= MIN_SECRET_LENGTH);
}

export interface LeakOptions {
  /** Keys whose values are public. Matched exactly. */
  allow?: readonly string[];
  /** Key prefixes whose values are public. Default `["VITE_"]`. */
  publicPrefixes?: readonly string[];
}

/** The env keys whose values appear, in any encoding, in any of the given file contents. */
export function leakedKeys(
  pairs: [string, string][],
  contents: string[],
  options: LeakOptions = {},
): string[] {
  const publicPrefixes = options.publicPrefixes ?? DEFAULT_PUBLIC_PREFIXES;
  const leaked = new Set<string>();
  for (const [key, value] of pairs) {
    if (value.length < MIN_SECRET_LENGTH || value.startsWith("op://")) {
      continue;
    }
    if (
      options.allow?.includes(key) ||
      publicPrefixes.some((prefix) => key.startsWith(prefix))
    ) {
      continue;
    }
    const forms = encodings(value);
    if (contents.some((text) => forms.some((form) => text.includes(form)))) {
      leaked.add(key);
    }
  }
  return [...leaked].sort();
}

/** Every KEY=value pair in the local env files of one or more directories. */
function localEnvPairs(dirs: string | readonly string[]): [string, string][] {
  return (typeof dirs === "string" ? [dirs] : dirs).flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => ENV_FILE.test(name) && !NOT_SECRETS.test(name))
      .flatMap((name) => parseEnvFile(readFileSync(join(dir, name), "utf8"))),
  );
}

/**
 * Every regular file under `dir`, recursively. Symlinks are skipped, so the
 * walk never loops or leaves the directory. `skip` holds paths relative to
 * `dir`, with forward slashes.
 */
function listFiles(
  dir: string,
  skip: readonly string[] = DEFAULT_SKIP,
): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        walk(path);
      } else if (
        stat.isFile() &&
        !skip.includes(relative(dir, path).split(sep).join("/"))
      ) {
        files.push(path);
      }
    }
  };
  walk(dir);
  return files;
}

/** File contents as text, decompressing `.gz` and `.br` files. */
function readBuilt(path: string): string {
  const bytes = readFileSync(path);
  try {
    if (path.endsWith(".gz")) return gunzipSync(bytes).toString("latin1");
    if (path.endsWith(".br"))
      return brotliDecompressSync(bytes).toString("latin1");
  } catch {
    // Not really compressed; scan the bytes as they are.
  }
  return bytes.toString("latin1");
}

export interface CheckResult {
  envValues: number;
  files: number;
  leaked: string[];
}

export interface CheckOptions extends LeakOptions {
  skip?: readonly string[];
}

/**
 * Scan one or more build directories against the local env files in one or
 * more directories, such as a package and its monorepo root.
 */
export function checkBundle(
  envDirs: string | readonly string[],
  dists: string | readonly string[],
  options: CheckOptions = {},
): CheckResult {
  const dirs = typeof dists === "string" ? [dists] : dists;
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      throw new Error(`${dir} does not exist. Build first.`);
    }
  }
  for (const dir of typeof envDirs === "string" ? [envDirs] : envDirs) {
    if (!existsSync(dir)) {
      throw new Error(`Env directory ${dir} does not exist.`);
    }
  }
  const pairs = localEnvPairs(envDirs);
  const files = dirs.flatMap((dir) =>
    listFiles(dir, options.skip ?? DEFAULT_SKIP),
  );
  const leaked = leakedKeys(pairs, files.map(readBuilt), options);
  return { envValues: pairs.length, files: files.length, leaked };
}
