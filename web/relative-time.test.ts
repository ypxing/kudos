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
});
