import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkBundle, leakedKeys, parseEnvFile } from "../src/check-bundle.js";

const SECRET = "alch_live_0123456789abcdef";

describe("parseEnvFile", () => {
  it("reads keys, strips quotes, skips comments and blanks", () => {
    expect(parseEnvFile(`# c\nA=${SECRET}\nexport B="quoted_value_1234"\nMODE=dev\n\n`)).toEqual([
      ["A", SECRET],
      ["B", "quoted_value_1234"],
      ["MODE", "dev"],
    ]);
  });
});

describe("leakedKeys", () => {
  it("names keys whose values appear and ignores short values", () => {
    const pairs = parseEnvFile(`A=${SECRET}\nMODE=development\n`);
    expect(leakedKeys(pairs, ['mode="development"'])).toEqual([]);
    expect(leakedKeys(pairs, [`const k="${SECRET}"`])).toEqual(["A"]);
  });
});

describe("checkBundle", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "workers-start-"));
    writeFileSync(join(root, ".env.local"), `API_KEY=${SECRET}\n`);
    writeFileSync(join(root, ".env.example"), "API_KEY=placeholder_value_here\n");
    mkdirSync(join(root, "dist", "server"), { recursive: true });
    writeFileSync(join(root, "dist", "server", "index.js"), "export default {}");
    // The Vite plugin's preview copy. wrangler never uploads it.
    writeFileSync(join(root, "dist", "server", ".dev.vars"), `API_KEY=${SECRET}\n`);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("passes a clean build and skips the preview .dev.vars copy", () => {
    expect(checkBundle(root, join(root, "dist"))).toEqual({ envValues: 1, files: 1, leaked: [] });
  });

  it("catches a secret compiled into a shipped file", () => {
    writeFileSync(join(root, "dist", "server", "chunk.js"), `fetch("?key=${SECRET}")`);
    expect(checkBundle(root, join(root, "dist")).leaked).toEqual(["API_KEY"]);
  });

  it("makes the CLI exit 1 on a leak, so a deploy chained after it stops", () => {
    writeFileSync(join(root, "dist", "server", "chunk.js"), SECRET);
    // The built file, which is what ships in the bin.
    const cli = join(import.meta.dirname, "..", "dist", "check-bundle-cli.js");
    expect(() => execFileSync(process.execPath, [cli, "--root", root], { stdio: "pipe" })).toThrow(/Refusing to ship/);
  });
});
