/**
 * Accept header parsing with q-values, per RFC 9110 section 12.5.1.
 */

export interface MediaRange {
  type: string;
  subtype: string;
  q: number;
}

/** Media ranges from an Accept header, lowercased. An empty or missing header means `*\/*`. */
export function parseAccept(header: string | null | undefined): MediaRange[] {
  if (!header?.trim()) {
    return [{ type: "*", subtype: "*", q: 1 }];
  }
  const ranges: MediaRange[] = [];
  for (const part of header.split(",")) {
    const [range = "", ...params] = part.split(";").map((s) => s.trim());
    const [type, subtype] = range.toLowerCase().split("/");
    if (!(type && subtype)) {
      continue;
    }
    let q = 1;
    for (const param of params) {
      const [key, value] = param.split("=").map((s) => s.trim());
      if (key?.toLowerCase() === "q" && value !== undefined) {
        const parsed = Number(value);
        q = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
      }
    }
    ranges.push({ type, subtype, q });
  }
  return ranges;
}

/**
 * The quality a client gives `mediaType`, from the most specific range that
 * matches it. 0 when nothing matches or the match says q=0.
 */
export function quality(
  ranges: readonly MediaRange[],
  mediaType: string,
  options: { exactOnly?: boolean } = {},
): number {
  const [type, subtype] = mediaType.toLowerCase().split("/");
  let best = -1;
  let q = 0;
  for (const range of ranges) {
    let specificity = -1;
    if (range.type === type && range.subtype === subtype) {
      specificity = 2;
    } else if (!options.exactOnly && range.type === type && range.subtype === "*") {
      specificity = 1;
    } else if (!options.exactOnly && range.type === "*" && range.subtype === "*") {
      specificity = 0;
    }
    if (specificity > best) {
      best = specificity;
      q = range.q;
    }
  }
  return q;
}
