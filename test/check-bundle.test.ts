import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkBundle, leakedKeys, parseEnvFile } from "../src/check-bundle.js";

const SECRET = "alch_live_0123456789abcdef";
// The built file, which is what ships in the bin.
const CLI = join(import.meta.dirname, "..", "dist", "check-bundle-cli.js");

describe("parseEnvFile", () => {
  it("parses dotenv the way dotenv does", () => {
    const source = [
      "# comment",
      `A=${SECRET}`,
      'export B="quoted_value_1234"',
      "C=sk_live_inline_secret_123 # rotate monthly",
      "D='single # not a comment'",
      'E="line one\\nline two"',
      'PEM="-----BEGIN KEY-----',
      "abc123",
      '-----END KEY-----"',
      'ESC="abc\\"def"',
      "",
    ].join("\n");
    expect(parseEnvFile(source)).toEqual([
      ["A", SECRET],
      ["B", "quoted_value_1234"],
      ["C", "sk_live_inline_secret_123"],
      ["D", "single # not a comment"],
      ["E", "line one\nline two"],
      ["PEM", "-----BEGIN KEY-----\nabc123\n-----END KEY-----"],
      ["ESC", 'abc"def'],
    ]);
  });
});

describe("leakedKeys", () => {
  const pairs = parseEnvFile(
    `A=${SECRET}\nMODE=development\nVITE_SITE_URL=https://example.com\nPUBLIC_ID=public_value_123\n`,
  );

  it("ignores short values, Vite public keys and allowed keys", () => {
    expect(leakedKeys(pairs, ['mode="development" "https://example.com"'])).toEqual([]);
    expect(leakedKeys(pairs, ["public_value_123"], { allow: ["PUBLIC_ID"] })).toEqual([]);
  });

  it("finds a secret raw, URL-encoded, JSON-escaped or base64-encoded", () => {
    const tricky = parseEnvFile('P="p@ss/w0rd\\"quote_long"\n');
    expect(leakedKeys(pairs, [`k="${SECRET}"`])).toEqual(["A"]);
    expect(leakedKeys(pairs, [Buffer.from(SECRET).toString("base64")])).toEqual(["A"]);
    expect(leakedKeys(tricky, [encodeURIComponent('p@ss/w0rd"quote_long')])).toEqual(["P"]);
    expect(leakedKeys(tricky, [JSON.stringify('p@ss/w0rd"quote_long')])).toEqual(["P"]);
  });

  it("skips 1Password references", () => {
    expect(leakedKeys(parseEnvFile("T=op://vault/item/field_name\n"), ["op://vault/item/field_name"])).toEqual([]);
  });
});

describe("checkBundle", () => {
  let root: string;
  const dist = () => join(root, "dist");

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "workers-start-"));
    writeFileSync(join(root, ".env.local"), `API_KEY=${SECRET}\n`);
    writeFileSync(join(root, ".env.example"), "API_KEY=placeholder_value_here\n");
    writeFileSync(join(root, ".env.tpl"), "OTHER=op://vault/item/field\n");
    mkdirSync(join(root, "dist", "server"), { recursive: true });
    mkdirSync(join(root, "dist", "client"), { recursive: true });
    writeFileSync(join(root, "dist", "server", "index.js"), "export default {}");
    // The Vite plugin's preview copy. wrangler never uploads it.
    writeFileSync(join(root, "dist", "server", ".dev.vars"), `API_KEY=${SECRET}\n`);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("passes a clean build and skips only the server preview copy", () => {
    expect(checkBundle(root, dist())).toEqual({ envValues: 1, files: 1, leaked: [] });
    writeFileSync(join(root, "dist", "client", ".dev.vars"), `API_KEY=${SECRET}\n`);
    expect(checkBundle(root, dist()).leaked).toEqual(["API_KEY"]);
  });

  it("catches a secret in a compressed asset", () => {
    writeFileSync(join(root, "dist", "client", "app.js.gz"), gzipSync(`fetch("?key=${SECRET}")`));
    expect(checkBundle(root, dist()).leaked).toEqual(["API_KEY"]);
  });

  it("skips symlinks instead of looping or leaving the build", () => {
    symlinkSync("..", join(root, "dist", "loop"));
    symlinkSync(join(root, ".env.local"), join(root, "dist", "client", "env-link"));
    expect(checkBundle(root, dist()).leaked).toEqual([]);
  });

  it("scans several build directories", () => {
    mkdirSync(join(root, "out"));
    writeFileSync(join(root, "out", "page.html"), SECRET);
    expect(checkBundle(root, [dist(), join(root, "out")]).leaked).toEqual(["API_KEY"]);
  });

  it("makes the CLI exit 1 on a leak, so a deploy chained after it stops", () => {
    writeFileSync(join(root, "dist", "server", "chunk.js"), SECRET);
    expect(() => execFileSync(process.execPath, [CLI, "--root", root], { stdio: "pipe" })).toThrow(/Refusing to ship/);
  });

  it("makes the CLI pass with --allow and honor --skip and --dist", () => {
    writeFileSync(join(root, "dist", "server", "chunk.js"), SECRET);
    const ok = (...args: string[]) =>
      execFileSync(process.execPath, [CLI, "--root", root, ...args], { encoding: "utf8" });
    expect(ok("--allow", "API_KEY")).toContain("ok");
    expect(ok("--public-prefix", "API_")).toContain("ok");
    expect(ok("--skip", "server/chunk.js")).toContain("ok");
    mkdirSync(join(root, "out"));
    expect(ok("--dist", "out")).toContain("ok");
    expect(() => execFileSync(process.execPath, [CLI, "--root", root, "--bogus"], { stdio: "pipe" })).toThrow(
      /Unknown argument/,
    );
  });
});
