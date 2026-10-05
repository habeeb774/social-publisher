// Publishing window and quiet days, evaluated in Riyadh time (UTC+3, no DST).
export type PublishingRules = {
  window: { enabled: boolean; start: string; end: string; mode: "warn" | "shift" };
  quietWeekdays: number[];
  quietDates: string[];
};
export const DEFAULT_RULES: PublishingRules = { window: { enabled: false, start: "00:00", end: "07:00", mode: "warn" }, quietWeekdays: [], quietDates: [] };
const OFFSET = 3 * 3600000;

const local = (at: Date) => { const d = new Date(at.getTime() + OFFSET); return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** True when `minutes` falls inside the blocked window [start, end), including windows that wrap midnight. */
function inWindow(minutes: number, start: string, end: string) {
  const s = toMinutes(start), e = toMinutes(end);
  return s <= e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

/** Returns why a time is not allowed, or null when publishing is allowed then. */
export function violation(at: Date, rules: PublishingRules): string | null {
  const l = local(at);
  if (rules.quietDates.includes(l.date)) return `يوم ${l.date} محدد كيوم بدون نشر`;
  if (rules.quietWeekdays.includes(l.weekday)) return `${["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][l.weekday]} يوم بدون نشر`;
  if (rules.window.enabled && inWindow(l.minutes, rules.window.start, rules.window.end)) return `الوقت داخل فترة إيقاف النشر (${rules.window.start}–${rules.window.end})`;
  return null;
}

/** The first allowed instant at or after `at` (minute resolution, up to 60 days ahead), or null if none. */
export function nextAllowed(at: Date, rules: PublishingRules): Date | null {
  let t = new Date(Math.ceil(at.getTime() / 60000) * 60000);
  for (let i = 0; i < 60 * 24 * 60; i++) {
    const reason = violation(t, rules);
    if (!reason) return t;
    const l = local(t);
    // Jump straight to the next local midnight for quiet days, or to the window end otherwise.
    if (rules.quietDates.includes(l.date) || rules.quietWeekdays.includes(l.weekday)) t = new Date(Date.parse(`${l.date}T00:00:00+03:00`) + 86400000);
    else { const end = toMinutes(rules.window.end); const delta = (end - l.minutes + 1440) % 1440 || 1440; t = new Date(t.getTime() + delta * 60000); }
  }
  return null;
}
