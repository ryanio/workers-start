#!/usr/bin/env node
// package-lock.json must keep the Linux binaries CI resolves. npm records only
// the os/cpu-gated packages it resolved on the machine that wrote the lockfile,
// so regenerating it on a Mac drops every *-linux-* entry and CI's `npm ci`
// fails. Fix a failure by deleting only the entries for the dependency you are
// changing and running `npm install`, never by regenerating the lockfile.
import { readFileSync } from "node:fs";

const REQUIRED = [
  "@biomejs/cli-linux-x64",
  "@rolldown/binding-linux-x64-gnu",
  "@typescript/typescript-linux-x64",
];

const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const names = new Set(
  Object.keys(lock.packages ?? {}).map((p) => p.split("node_modules/").pop()),
);
const missing = REQUIRED.filter((name) => !names.has(name));
if (missing.length > 0) {
  console.error(
    `package-lock.json is missing Linux binaries: ${missing.join(", ")}`,
  );
  process.exit(1);
}
