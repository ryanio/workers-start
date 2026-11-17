/**
 * Inline scripts for the document head, as strings to put in
 * `dangerouslySetInnerHTML`. Both run before hydration and touch nothing
 * React renders, so they cause no hydration mismatch.
 */

export interface ThemeScriptOptions {
  /** localStorage key. Default `theme`. */
  storageKey?: string;
  /** Attribute set on `<html>`. Default `data-theme`. */
  attribute?: string;
  /** Accepted stored values. Default `["light", "dark"]`. */
  values?: string[];
}

/**
 * Applies a stored theme choice before first paint, so it never flashes the
 * other theme. With no stored choice it does nothing, and CSS
 * `color-scheme: light dark` follows the operating system.
 */
export function themeScript(options: ThemeScriptOptions = {}): string {
  const key = JSON.stringify(options.storageKey ?? "theme");
  const attribute = JSON.stringify(options.attribute ?? "data-theme");
  const values = JSON.stringify(options.values ?? ["light", "dark"]);
  return `try{var t=localStorage.getItem(${key});if(${values}.indexOf(t)!==-1){document.documentElement.setAttribute(${attribute},t)}}catch(e){}`;
}

export interface AnalyticsScriptOptions {
  /** GA4 measurement id, `G-…`. Public; safe in the bundle. */
  measurementId: string;
  /** Hostnames that report. Every other host (localhost, previews) loads nothing. */
  hosts: string[];
}

/**
 * Google Analytics 4 bootstrap gated on `location.hostname`, so local dev and
 * preview deploys never fetch gtag.js or land in the production property.
 */
export function analyticsScript({ measurementId, hosts }: AnalyticsScriptOptions): string {
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) {
    throw new Error(`Not a GA4 measurement id: ${measurementId}`);
  }
  const id = JSON.stringify(measurementId);
  return `(function(){if(${JSON.stringify(hosts)}.indexOf(location.hostname)===-1)return;var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+${id};document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;gtag("js",new Date());gtag("config",${id});})();`;
}
