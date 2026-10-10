// Local-time helpers shared by the sources, the pipeline and the queries. Instants are unix seconds;
// days are local `YYYY-MM-DD` in the configured IANA zone.

const formatters = new Map<string, Intl.DateTimeFormat>();

/** `wall` read through Intl: the reference every cached reading must equal. */
function intlWall(s: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(s * 1000)).map((x) => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    asUtc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000,
  };
}

// Intl with a time zone is slow where the engine reaches the OS for it (Hermes on Android goes through Java ICU), and a
// screen can ask for thousands of readings. So the zone's offset is read once per 15-minute slice and the wall time is
// arithmetic. A slice whose start and end disagree holds a transition: each instant in it goes to Intl.
const SLICE_S = 900;
const MIXED = Number.NaN;
const offsets = new Map<string, Map<number, number>>();
// ponytail: a zone's cache is dropped whole past this many slices (about a year of quarter hours); an LRU if that churns.
const MAX_SLICES = 40_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall-clock reading of instant `s`: the day, `HH:mm:ss`, and that wall time read as if it were UTC. */
export function wall(s: number, tz: string) {
  const t = Math.floor(s);
  // Years outside 1970..9999 keep Intl's own year format and the zones' pre-1970 local mean times.
  if (t < 0 || t >= 253_402_300_800) return intlWall(s, tz);
  let zone = offsets.get(tz);
  if (!zone || zone.size > MAX_SLICES) offsets.set(tz, (zone = new Map()));
  const slice = Math.floor(t / SLICE_S);
  let off = zone.get(slice);
  if (off === undefined) {
    const start = slice * SLICE_S;
    const a = intlWall(start, tz).asUtc - start;
    const b = intlWall(start + SLICE_S - 1, tz).asUtc - (start + SLICE_S - 1);
    off = a === b ? a : MIXED;
    zone.set(slice, off);
  }
  if (Number.isNaN(off)) return intlWall(s, tz);
  const d = new Date((t + off) * 1000);
  return {
    day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    asUtc: t + off,
  };
}

/** The local day containing instant `s`. */
export const localDay = (s: number, tz: string) => wall(s, tz).day;

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Whole days from `from` to `to`. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * The first instant of local `day`. Midnight is tried under each offset in force within a day of it, and the
 * earliest candidate that falls on `day` wins: the first of a repeated midnight (fall-back to 00:00), or the
 * transition itself when a spring-forward at 00:00 skips midnight (Santiago, Havana, Azores...).
 */
export function localMidnight(day: string, tz: string): number {
  const utc = Date.parse(`${day}T00:00:00Z`) / 1000;
  const offset = (s: number) => wall(s, tz).asUtc - s;
  return Math.min(...[-86_400, 0, 86_400].map((d) => utc - offset(utc + d)).filter((s) => localDay(s, tz) === day));
}

/** The instant a local wall time (`YYYY-MM-DDTHH:mm[:ss]`) names in `tz`; in a DST gap, the same offset trick as localMidnight. */
export function fromWall(civil: string, tz: string): number {
  const utc = Date.parse(`${civil.length === 16 ? `${civil}:00` : civil}Z`) / 1000;
  const offset = (s: number) => wall(s, tz).asUtc - Math.floor(s);
  return utc - offset(utc - offset(utc));
}

/** Seconds `tz` is ahead of UTC at instant `s`. */
export const utcOffsetS = (s: number, tz: string) => wall(s, tz).asUtc - Math.floor(s);

/** Minutes after local midnight of instant `s`. */
export const localMinutes = (s: number, tz: string) => Math.round((s - localMidnight(localDay(s, tz), tz)) / 60);

// Age from a `YYYY-MM-DD` birth date on a `YYYY-MM-DD` day. Both agree on every day: fractionalYears floors
// to wholeYears and equals it on a birthday. A Feb 29 birthday falls on Mar 1 in common years.

/** Completed years on `day`; the birthday itself counts. Sleep need and the max-HR estimate use this. */
export function wholeYears(birthDate: string, day: string) {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Completed years plus the elapsed share of the current birthday year. Healthspan and fitness use this. */
export function fractionalYears(birthDate: string, day: string) {
  const whole = wholeYears(birthDate, day);
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const birthday = (n: number) => Date.UTC(by + n, bm - 1, bd); // Feb 29 in a common year rolls to Mar 1
  return whole + (Date.parse(day) - birthday(whole)) / (birthday(whole + 1) - birthday(whole));
}
