const format = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "long" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Fixed-length units, no calendar arithmetic: a week is 7 days, a month 30, a year 365.
export function relativeTime(then: Date, now: Date): string {
  const elapsed = now.getTime() - then.getTime();
  const days = Math.floor(elapsed / DAY);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), "hour");
  if (days < 7) return format.format(-days, "day");
  if (days < 30) return format.format(-Math.floor(days / 7), "week");
  if (days < 365) return format.format(-Math.min(Math.floor(days / 30), 11), "month");
  return format.format(-Math.floor(days / 365), "year");
}
