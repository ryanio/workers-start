import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { analyticsScript, themeScript } from "../src/scripts.js";

function run(script: string, opts: { stored?: string | null; hostname?: string }) {
  const attributes: Record<string, string> = {};
  const appended: string[] = [];
  const window: { dataLayer?: unknown[]; gtag?: unknown } = {};
  runInNewContext(script, {
    localStorage: { getItem: () => opts.stored ?? null },
    location: { hostname: opts.hostname ?? "localhost" },
    window,
    document: {
      documentElement: { setAttribute: (k: string, v: string) => (attributes[k] = v) },
      createElement: () => ({}),
      head: { appendChild: (el: { src: string }) => appended.push(el.src) },
    },
  });
  return { attributes, appended, window };
}

describe("themeScript", () => {
  it("applies a stored choice and ignores anything else", () => {
    expect(run(themeScript(), { stored: "dark" }).attributes).toEqual({ "data-theme": "dark" });
    expect(run(themeScript(), { stored: "purple" }).attributes).toEqual({});
    expect(run(themeScript(), { stored: null }).attributes).toEqual({});
  });
});

describe("analyticsScript", () => {
  const script = analyticsScript({ measurementId: "G-ABC123", hosts: ["example.com"] });

  it("loads gtag only on a production host", () => {
    expect(run(script, { hostname: "example.com" }).appended).toEqual([
      "https://www.googletagmanager.com/gtag/js?id=G-ABC123",
    ]);
    expect(run(script, { hostname: "localhost" }).appended).toEqual([]);
    expect(run(script, { hostname: "preview.example.workers.dev" }).window.dataLayer).toBeUndefined();
  });

  it("rejects anything that is not a GA4 id, since it is inlined into a script", () => {
    expect(() => analyticsScript({ measurementId: "G-1');alert(1)//", hosts: [] })).toThrow();
  });
});
