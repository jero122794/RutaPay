// backend/src/shared/bogota-day.ts
/** Calendar day in America/Bogota as YYYY-MM-DD. */
export const getBogotaTodayYmd = (): string => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
};

/**
 * Inclusive start and exclusive end in UTC for a Bogota calendar day.
 * Colombia is UTC-5 year-round: local midnight = 05:00 UTC same calendar date.
 */
export const bogotaDayBoundsUtc = (ymd: string): { start: Date; endExclusive: Date } => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const start = new Date(Date.UTC(y, mo - 1, d, 5, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, mo - 1, d + 1, 5, 0, 0, 0));
  return { start, endExclusive };
};
