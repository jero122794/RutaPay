// backend/src/shared/bogota-date.ts
/** Colombia (America/Bogotá) has no DST; standard offset is UTC−5 year-round. */
const BOGOTA_UTC_HOUR = 5;

/**
 * Interprets YYYY-MM-DD as that calendar date in Bogotá (start of local day).
 * Returns the UTC instant for 00:00 in Bogotá (05:00 UTC).
 */
export const parseBogotaDateOnlyToUTC = (ymd: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) {
    throw new Error(`Expected YYYY-MM-DD, got: ${ymd}`);
  }
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return new Date(Date.UTC(y, month - 1, day, BOGOTA_UTC_HOUR, 0, 0, 0));
};
