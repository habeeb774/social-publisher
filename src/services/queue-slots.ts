// Pure queue-slot math. Riyadh has no DST, so a fixed +03:00 offset is exact.
export type Slot = { weekday: number; time: string };
const OFFSET_MS = 3 * 3600 * 1000;

export function isValidSlot(slot: Slot) {
  return Number.isInteger(slot.weekday) && slot.weekday >= 0 && slot.weekday <= 6 && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time);
}

/** Returns the next `count` free slot instants strictly after `from` (plus a 1-minute safety margin). */
export function nextFreeSlots(slots: Slot[], from: Date, count: number, taken: Iterable<number> = [], horizonDays = 120, allowed: (at: Date) => boolean = () => true) {
  const valid = slots.filter(isValidSlot);
  if (!valid.length || count <= 0) return [];
  const busy = new Set(Array.from(taken, (ms) => Math.floor(ms / 60000)));
  const earliest = from.getTime() + 60000;
  const riyadhMidnight = Math.floor((from.getTime() + OFFSET_MS) / 86400000) * 86400000 - OFFSET_MS;
  const result: Date[] = [];
  for (let day = 0; day < horizonDays && result.length < count; day++) {
    const dayStart = riyadhMidnight + day * 86400000;
    const weekday = new Date(dayStart + OFFSET_MS).getUTCDay();
    const times = valid.filter((slot) => slot.weekday === weekday).map((slot) => slot.time).sort();
    for (const time of times) {
      const [h, m] = time.split(":").map(Number);
      const at = dayStart + (h * 60 + m) * 60000;
      if (at < earliest || busy.has(Math.floor(at / 60000)) || !allowed(new Date(at))) continue;
      busy.add(Math.floor(at / 60000));
      result.push(new Date(at));
      if (result.length === count) break;
    }
  }
  return result;
}
