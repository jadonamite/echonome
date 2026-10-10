/** US equity sessions in New York time, used to place hourly candles and to settle calls. */

export type Session = "regular" | "pre" | "post" | "overnight" | "weekend" | "holiday";

/** NYSE full-day closures for 2026. */
export const NYSE_HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
]);

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
});

export interface NyTime {
  date: string; // YYYY-MM-DD in New York
  hour: number;
  minute: number;
  weekday: number; // 0 Sunday .. 6 Saturday
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function nyTime(ms: number): NyTime {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAYS[p.weekday] };
}

/** Epoch ms of a wall-clock time in New York on a given date. */
export function nyToMs(date: string, hour: number, minute = 0): number {
  const [y, m, d] = date.split("-").map(Number);
  // Start from the UTC instant with the same wall-clock value, then correct by the offset.
  let guess = Date.UTC(y, m - 1, d, hour, minute);
  for (let i = 0; i < 2; i++) {
    const t = nyTime(guess);
    const shown = Date.UTC(Number(t.date.slice(0, 4)), Number(t.date.slice(5, 7)) - 1, Number(t.date.slice(8, 10)), t.hour, t.minute);
    guess += Date.UTC(y, m - 1, d, hour, minute) - shown;
  }
  return guess;
}

export function isTradingDay(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !NYSE_HOLIDAYS_2026.has(date);
}

export function session(ms: number): Session {
  const t = nyTime(ms);
  if (!isTradingDay(t.date)) return t.weekday === 0 || t.weekday === 6 ? "weekend" : "holiday";
  const m = t.hour * 60 + t.minute;
  if (m >= 570 && m < 960) return "regular";
  if (m >= 240 && m < 570) return "pre";
  if (m >= 960 && m < 1200) return "post";
  return "overnight";
}

export function previousTradingDay(date: string): string {
  let [y, m, d] = date.split("-").map(Number);
  for (;;) {
    const t = new Date(Date.UTC(y, m - 1, d - 1));
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
    const s = t.toISOString().slice(0, 10);
    if (isTradingDay(s)) return s;
  }
}

export function nextTradingDay(date: string): string {
  let [y, m, d] = date.split("-").map(Number);
  for (;;) {
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
    const s = t.toISOString().slice(0, 10);
    if (isTradingDay(s)) return s;
  }
}
