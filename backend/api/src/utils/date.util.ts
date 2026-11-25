export const DAY_MS = 864e5;
export const MINUTE_MS = 60_000;

/** Offset (minutes) of an IANA timezone from UTC at the given instant (DST-aware). */
export function tzOffsetMin(tz: string, at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / MINUTE_MS);
}

/** Quiet hours in the user's timezone; returns ms to wait (0 if delivery is allowed now). Windows may cross midnight. */
export function quietDelayMs(pref: { quietStartMin: number | null; quietEndMin: number | null } | null, tz: string, now = new Date()) {
  if (!pref || pref.quietStartMin == null || pref.quietEndMin == null) return 0;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const cur = Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value);
  const { quietStartMin: s, quietEndMin: e } = pref;
  const inQuiet = s < e ? cur >= s && cur < e : cur >= s || cur < e;
  if (!inQuiet) return 0;
  return ((e - cur + 1440) % 1440) * MINUTE_MS;
}
