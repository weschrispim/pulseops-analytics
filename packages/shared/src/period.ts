import { DISPLAY_TIME_ZONE } from "./enums.js";

export type CivilDate = string; // YYYY-MM-DD

export interface PeriodBoundsUtc {
  /** Inclusive lower bound (UTC instant). */
  startUtc: Date;
  /** Exclusive upper bound (UTC instant). */
  endExclusiveUtc: Date;
  fromCivil: CivilDate;
  toCivil: CivilDate;
  timeZone: typeof DISPLAY_TIME_ZONE;
}

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parts of a UTC instant as calendar Y-M-D (and H-M-S-ms) in a given IANA zone.
 * Uses Intl — no extra dependency; DST handled by the zone database when applicable.
 * Brazil (America/Sao_Paulo) has had no DST since 2019; offsets still resolve via IANA.
 */
export function zonedParts(
  instant: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function toCivilDateInTimeZone(
  instant: Date,
  timeZone: string = DISPLAY_TIME_ZONE,
): CivilDate {
  const { year, month, day } = zonedParts(instant, timeZone);
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/**
 * Convert a civil date at local midnight in `timeZone` to a UTC Date.
 * Iterative refinement against Intl offset (handles DST transition days when present).
 */
export function civilDateStartUtc(
  civilDate: CivilDate,
  timeZone: string = DISPLAY_TIME_ZONE,
): Date {
  if (!CIVIL_DATE_RE.test(civilDate)) {
    throw new Error(`Invalid civil date: ${civilDate}`);
  }
  const [y, m, d] = civilDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  // Initial guess: treat as UTC midnight of that Y-M-D, then correct by zone offset.
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const asUtcLike = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );
    const desired = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    guess += desired - asUtcLike;
  }
  // Verify
  const verify = zonedParts(new Date(guess), timeZone);
  if (
    verify.year !== y ||
    verify.month !== m ||
    verify.day !== d ||
    verify.hour !== 0 ||
    verify.minute !== 0 ||
    verify.second !== 0
  ) {
    // Ambiguous/fold edge: snap by scanning nearby minutes (rare for SP).
    for (let delta = -12 * 60; delta <= 12 * 60; delta += 1) {
      const candidate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) + delta * 60_000);
      const p = zonedParts(candidate, timeZone);
      if (
        p.year === y &&
        p.month === m &&
        p.day === d &&
        p.hour === 0 &&
        p.minute === 0 &&
        p.second === 0
      ) {
        return candidate;
      }
    }
    throw new Error(`Could not resolve start of ${civilDate} in ${timeZone}`);
  }
  return new Date(guess);
}

export function addCivilDays(civilDate: CivilDate, days: number): CivilDate {
  const [y, m, d] = civilDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return `${utc.getUTCFullYear().toString().padStart(4, "0")}-${(
    utc.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${utc.getUTCDate().toString().padStart(2, "0")}`;
}

/**
 * Semi-open period: openedAt >= startUtc AND openedAt < endExclusiveUtc
 */
export function civilPeriodToUtcBounds(
  fromCivil: CivilDate,
  toCivil: CivilDate,
  timeZone: string = DISPLAY_TIME_ZONE,
): PeriodBoundsUtc {
  if (!CIVIL_DATE_RE.test(fromCivil) || !CIVIL_DATE_RE.test(toCivil)) {
    throw new Error("from/to must be YYYY-MM-DD civil dates");
  }
  if (fromCivil > toCivil) {
    throw new Error("from must be <= to");
  }
  const startUtc = civilDateStartUtc(fromCivil, timeZone);
  const endExclusiveUtc = civilDateStartUtc(addCivilDays(toCivil, 1), timeZone);
  return {
    startUtc,
    endExclusiveUtc,
    fromCivil,
    toCivil,
    timeZone: DISPLAY_TIME_ZONE,
  };
}

export function defaultCivilPeriod(
  referenceNow: Date,
  dayCount = 30,
  timeZone: string = DISPLAY_TIME_ZONE,
): { from: CivilDate; to: CivilDate } {
  const to = toCivilDateInTimeZone(referenceNow, timeZone);
  const from = addCivilDays(to, -(dayCount - 1));
  return { from, to };
}

export function isInHalfOpenPeriod(
  openedAt: Date,
  bounds: PeriodBoundsUtc,
): boolean {
  return (
    openedAt.getTime() >= bounds.startUtc.getTime() &&
    openedAt.getTime() < bounds.endExclusiveUtc.getTime()
  );
}
