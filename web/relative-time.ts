const format = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "long" });

export function relativeTime(then: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  return format.format(-minutes, "minute");
}
