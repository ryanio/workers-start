/**
 * Inline scripts for the document head, as strings to put in
 * `dangerouslySetInnerHTML`. Both run before hydration and touch nothing
 * React renders, so they cause no hydration mismatch.
 */

/**
 * JSON for embedding in an inline script: `<`, U+2028 and U+2029 are escaped,
 * so no value can close the script tag or break the line.
 */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export interface ThemeScriptOptions {
  /** localStorage key. Default `theme`. */
  storageKey?: string;
  /** Accepted stored values. Default `["light", "dark"]`. */
  values?: string[];
  /**
   * How the choice is applied to `<html>`: set as an attribute (default
   * `data-theme`), or added as a class (`{ class: true }`, as Tailwind's
   * class-based dark mode expects).
   */
  target?: { attribute: string } | { class: true };
  /**
   * With no stored choice, apply the OS preference anyway (needed when CSS
   * keys dark mode off the class or attribute rather than the media query).
   */
  followSystem?: boolean;
}

/**
 * Applies the stored theme before first paint, so it never flashes the other
 * one. With nothing stored and `followSystem` off it does nothing, and CSS
 * `color-scheme: light dark` follows the operating system.
 */
export function themeScript(options: ThemeScriptOptions = {}): string {
  const key = inlineJson(options.storageKey ?? "theme");
  const values = inlineJson(options.values ?? ["light", "dark"]);
  const target = options.target ?? { attribute: "data-theme" };
  const apply =
    "class" in target
      ? `var c=document.documentElement.classList;${values}.forEach(function(v){c.remove(v)});c.add(t)`
      : `document.documentElement.setAttribute(${inlineJson(target.attribute)},t)`;
  const fallback = options.followSystem
    ? `if(${values}.indexOf(t)===-1){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}`
    : "";
  return `try{var t=localStorage.getItem(${key});${fallback}if(${values}.indexOf(t)!==-1){${apply}}}catch(e){}`;
}

export interface AnalyticsScriptOptions {
  /** GA4 measurement id, `G-…`. Public; safe in the bundle. */
  measurementId: string;
  /** Hostnames that report, compared without case. Every other host (localhost, previews) loads nothing. */
  hosts: string[];
  /** Path prefixes that never load analytics, such as `/admin`. */
  skipPaths?: string[];
  /**
   * Load only after consent: the name of a cookie that must be present (and
   * equal `value`, when given). Without it, analytics loads on every page view.
   */
  consentCookie?: { name: string; value?: string };
}

/** The hostname, path and consent checks both analytics bootstraps start with. */
function gateChecks(options: {
  hosts: string[];
  skipPaths?: string[];
  consentCookie?: { name: string; value?: string };
}): string {
  const hosts = inlineJson(options.hosts.map((h) => h.toLowerCase()));
  const checks = [
    `if(${hosts}.indexOf(location.hostname.toLowerCase())===-1)return;`,
  ];
  if (options.skipPaths?.length) {
    checks.push(
      `var p=location.pathname;if(${inlineJson(options.skipPaths)}.some(function(s){return p===s||p.indexOf(s.replace(/\\/$/,"")+"/")===0}))return;`,
    );
  }
  if (options.consentCookie) {
    const pair =
      options.consentCookie.value === undefined
        ? null
        : `${options.consentCookie.name}=${options.consentCookie.value}`;
    checks.push(
      `var k=document.cookie.split(/;\\s*/);if(!k.some(function(c){return ${pair === null ? `c.split("=")[0]===${inlineJson(options.consentCookie.name)}` : `c===${inlineJson(pair)}`}}))return;`,
    );
  }
  return checks.join("");
}

/**
 * Google Analytics 4 bootstrap gated on `location.hostname`, so local dev and
 * preview deploys never fetch gtag.js or land in the production property.
 */
export function analyticsScript(options: AnalyticsScriptOptions): string {
  if (!/^G-[A-Z0-9]+$/.test(options.measurementId)) {
    throw new Error(`Not a GA4 measurement id: ${options.measurementId}`);
  }
  const id = inlineJson(options.measurementId);
  return `(function(){${gateChecks(options)}var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+${id};document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;gtag("js",new Date());gtag("config",${id});})();`;
}

export interface TagManagerScriptOptions
  extends Omit<AnalyticsScriptOptions, "measurementId"> {
  /** Google Tag Manager container id, `GTM-…`. Public; safe in the bundle. */
  containerId: string;
}

/**
 * Google Tag Manager bootstrap with the same gates as `analyticsScript`: only
 * the listed hosts load gtm.js, so local dev and previews never fire tags.
 */
export function tagManagerScript(options: TagManagerScriptOptions): string {
  if (!/^GTM-[A-Z0-9]+$/.test(options.containerId)) {
    throw new Error(`Not a Tag Manager container id: ${options.containerId}`);
  }
  const id = inlineJson(options.containerId);
  return `(function(){${gateChecks(options)}window.dataLayer=window.dataLayer||[];window.dataLayer.push({"gtm.start":new Date().getTime(),event:"gtm.js"});var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtm.js?id="+${id};document.head.appendChild(s);})();`;
}
