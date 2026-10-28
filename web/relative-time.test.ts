import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

const now = new Date("2026-06-15T12:00:00Z");
const ago = (ms: number) => relativeTime(new Date(now.getTime() - ms), now);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("reads 'just now' under a minute", () => {
    expect(ago(30 * SEC)).toBe("just now");
  });

  it("counts whole minutes under an hour", () => {
    expect(ago(5 * MIN)).toBe("5 minutes ago");
    expect(ago(MIN)).toBe("1 minute ago");
    expect(ago(59 * MIN + 59 * SEC)).toBe("59 minutes ago");
  });

  it("counts whole hours under a day", () => {
    expect(ago(3 * HOUR)).toBe("3 hours ago");
    expect(ago(23 * HOUR + 59 * MIN)).toBe("23 hours ago");
  });

  it("counts whole days under a week, with 1 day as 'yesterday'", () => {
    expect(ago(DAY)).toBe("yesterday");
    expect(ago(6 * DAY + 23 * HOUR)).toBe("6 days ago");
  });

  it("counts 7-day weeks under 30 days", () => {
    expect(ago(7 * DAY)).toBe("last week");
    expect(ago(14 * DAY)).toBe("2 weeks ago");
    expect(ago(29 * DAY)).toBe("4 weeks ago");
  });

  it("counts 30-day months under a year, capped at 11", () => {
    expect(ago(30 * DAY)).toBe("last month");
    expect(ago(90 * DAY)).toBe("3 months ago");
    expect(ago(364 * DAY)).toBe("11 months ago");
  });

  it("counts 365-day years with no cutoff", () => {
    expect(ago(365 * DAY)).toBe("last year");
    expect(ago(2 * 365 * DAY)).toBe("2 years ago");
  });

  it("reads 'just now' for a time in the future", () => {
    expect(ago(-3 * MIN)).toBe("just now");
  });
});
