import { describe, expect, it } from "vitest";
import { isTradingDay, nextTradingDay, nyTime, nyToMs, previousTradingDay, session } from "../src/sessions.js";

describe("sessions", () => {
  it("converts New York wall-clock time across daylight saving", () => {
    expect(new Date(nyToMs("2026-10-09", 16)).toISOString()).toBe("2026-10-09T20:00:00.000Z");
    expect(new Date(nyToMs("2026-12-01", 9, 30)).toISOString()).toBe("2026-12-01T14:30:00.000Z");
    expect(nyTime(Date.parse("2026-10-09T20:00:00Z"))).toMatchObject({ date: "2026-10-09", hour: 16, weekday: 5 });
  });

  it("classifies sessions", () => {
    expect(session(nyToMs("2026-10-09", 10))).toBe("regular");
    expect(session(nyToMs("2026-10-09", 8))).toBe("pre");
    expect(session(nyToMs("2026-10-09", 18))).toBe("post");
    expect(session(nyToMs("2026-10-09", 22))).toBe("overnight");
    expect(session(nyToMs("2026-10-10", 12))).toBe("weekend");
    expect(session(nyToMs("2026-09-07", 12))).toBe("holiday");
  });

  it("walks trading days over weekends and holidays", () => {
    expect(isTradingDay("2026-10-10")).toBe(false);
    expect(previousTradingDay("2026-10-12")).toBe("2026-10-09");
    expect(previousTradingDay("2026-09-08")).toBe("2026-09-04");
    expect(nextTradingDay("2026-10-09")).toBe("2026-10-12");
  });
});
