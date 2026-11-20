import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  analyticsScript,
  inlineJson,
  tagManagerScript,
  themeScript,
} from "../src/scripts.js";

interface Page {
  stored?: string | null;
  hostname?: string;
  pathname?: string;
  cookie?: string;
  systemDark?: boolean;
}

function run(script: string, page: Page) {
  const attributes: Record<string, string> = {};
  const classes = new Set<string>(["light"]);
  const appended: string[] = [];
  const window: {
    dataLayer?: unknown[];
    gtag?: unknown;
    matchMedia?: unknown;
  } = {
    matchMedia: () => ({ matches: page.systemDark ?? false }),
  };
  runInNewContext(script, {
    localStorage: { getItem: () => page.stored ?? null },
    location: {
      hostname: page.hostname ?? "localhost",
      pathname: page.pathname ?? "/",
    },
    window,
    document: {
      cookie: page.cookie ?? "",
      documentElement: {
        setAttribute: (k: string, v: string) => {
          attributes[k] = v;
        },
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
        },
      },
      createElement: () => ({}),
      head: { appendChild: (el: { src: string }) => appended.push(el.src) },
    },
  });
  return { attributes, classes: [...classes], appended, window };
}

describe("themeScript", () => {
  it("applies a stored choice and ignores anything else", () => {
    expect(run(themeScript(), { stored: "dark" }).attributes).toEqual({
      "data-theme": "dark",
    });
    expect(run(themeScript(), { stored: "purple" }).attributes).toEqual({});
    expect(run(themeScript(), { stored: null }).attributes).toEqual({});
  });

  it("can set a class and follow the system with nothing stored", () => {
    const script = themeScript({
      target: { class: true },
      followSystem: true,
      storageKey: "mode",
    });
    expect(run(script, { stored: null, systemDark: true }).classes).toEqual([
      "dark",
    ]);
    expect(run(script, { stored: "light", systemDark: true }).classes).toEqual([
      "light",
    ]);
  });

  it("cannot be broken out of with a crafted value", () => {
    const script = themeScript({
      values: ["light", "</script><script>alert(1)</script>"],
    });
    expect(script).not.toContain("</script>");
  });
});

describe("analyticsScript", () => {
  const script = analyticsScript({
    measurementId: "G-ABC123",
    hosts: ["Example.com"],
  });
  const gtag = ["https://www.googletagmanager.com/gtag/js?id=G-ABC123"];

  it("loads gtag only on a production host, ignoring case", () => {
    expect(run(script, { hostname: "example.com" }).appended).toEqual(gtag);
    expect(run(script, { hostname: "localhost" }).appended).toEqual([]);
    expect(
      run(script, { hostname: "preview.example.workers.dev" }).window.dataLayer,
    ).toBeUndefined();
  });

  it("skips listed paths and waits for consent", () => {
    const gated = analyticsScript({
      measurementId: "G-ABC123",
      hosts: ["example.com"],
      skipPaths: ["/admin"],
      consentCookie: { name: "consent", value: "yes" },
    });
    const on = { hostname: "example.com", cookie: "a=1; consent=yes" };
    expect(run(gated, on).appended).toEqual(gtag);
    expect(run(gated, { ...on, pathname: "/admin/users" }).appended).toEqual(
      [],
    );
    expect(run(gated, { ...on, pathname: "/administer" }).appended).toEqual(
      gtag,
    );
    expect(run(gated, { ...on, cookie: "consent=no" }).appended).toEqual([]);
  });

  it("rejects anything that is not a GA4 id and escapes hosts", () => {
    expect(() =>
      analyticsScript({ measurementId: "G-1');alert(1)//", hosts: [] }),
    ).toThrow();
    const hostile = analyticsScript({
      measurementId: "G-A1",
      hosts: ["</script><img src=x onerror=alert(1)>"],
    });
    expect(hostile).not.toContain("</script>");
  });
});

describe("inlineJson", () => {
  it("escapes characters that end a script or a line", () => {
    expect(inlineJson("</script>\u2028")).toBe('"\\u003c/script>\\u2028"');
  });
});

describe("tagManagerScript", () => {
  const script = tagManagerScript({
    containerId: "GTM-ABC123",
    hosts: ["example.com"],
    skipPaths: ["/admin"],
  });
  const gtm = ["https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"];

  it("loads gtm.js and pushes the start event only on a production host", () => {
    const live = run(script, { hostname: "Example.com" });
    expect(live.appended).toEqual(gtm);
    expect(live.window.dataLayer).toEqual([
      expect.objectContaining({
        event: "gtm.js",
        "gtm.start": expect.any(Number),
      }),
    ]);
    const local = run(script, { hostname: "localhost" });
    expect(local.appended).toEqual([]);
    expect(local.window.dataLayer).toBeUndefined();
    expect(
      run(script, { hostname: "example.com", pathname: "/admin" }).appended,
    ).toEqual([]);
  });

  it("rejects anything that is not a container id", () => {
    expect(() =>
      tagManagerScript({ containerId: "G-ABC123", hosts: [] }),
    ).toThrow();
    expect(() =>
      tagManagerScript({ containerId: "GTM-1');alert(1)//", hosts: [] }),
    ).toThrow();
  });
});
