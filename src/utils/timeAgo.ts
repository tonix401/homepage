/**
 * How long ago a moment was, the way VSCode's timeline and graph put it:
 * "5 min. ago", "yesterday", "3 wk. ago". Worked out when it is shown rather
 * than at build time, so a commit's age keeps up after the deploy.
 */

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const format = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

export function timeAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
  }
  return "now";
}
