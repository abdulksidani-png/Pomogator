/**
 * Days are counted in the user's own time zone, with an optional rollover hour so
 * late-night studying (e.g. 1 AM with a 4 AM rollover) counts toward the day before.
 */

export function detectTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    // en-CA formats dates as YYYY-MM-DD.
    f = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The calendar day (YYYY-MM-DD) that a moment counts for. */
export function localDate(ts: number, timeZone = '', rolloverHour = 0): string {
  const shifted = ts - rolloverHour * 3_600_000;
  try {
    return formatterFor(timeZone).format(shifted);
  } catch {
    const d = new Date(shifted); // unknown time zone: fall back to the device's own
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

export const dayOf = (ts: number, s: { timezone: string; rollover: number }) => localDate(ts, s.timezone, s.rollover);
export const todayFor = (s: { timezone: string; rollover: number }) => dayOf(Date.now(), s);

/** Every IANA time zone the browser knows, for the profile picker. */
export function timeZoneList(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn('timeZone');
  } catch { /* older browser */ }
  return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];
}
