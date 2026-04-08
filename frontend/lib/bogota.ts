// frontend/lib/bogota.ts
import { parseISO } from "date-fns";

/** Colombia (America/Bogotá) has no DST; standard offset is UTC−5 year-round. */
const BOGOTA_UTC_HOUR = 5;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

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

/**
 * API / HTML date values: plain YYYY-MM-DD is NOT UTC midnight — it is a Bogotá calendar day.
 * Full ISO strings (e.g. from Prisma) are parsed as absolute instants.
 */
export const parseApiDateString = (value: string): Date => {
  const t = value.trim();
  if (DATE_ONLY.test(t)) {
    return parseBogotaDateOnlyToUTC(t);
  }
  return parseISO(t);
};

export const getBogotaTodayKey = (): string => {
  return formatter.format(new Date());
};

export const toBogotaDayKey = (value: string): string => {
  const d = parseApiDateString(value);
  return formatter.format(d);
};

export const toBogotaDayKeyFromDate = (value: Date): string => {
  return formatter.format(value);
};

export const getBogotaYMD = (): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
};

export const formatBogotaDate = (value: Date): string => {
  const f = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  return f.format(value);
};

export const formatBogotaDateFromString = (value: string): string => {
  const d = parseApiDateString(value);
  return formatBogotaDate(d);
};

/** Previous calendar day in America/Bogota (YYYY-MM-DD). */
export const getBogotaYesterdayKey = (): string => {
  const todayStart = parseBogotaDateOnlyToUTC(getBogotaTodayKey());
  const prev = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  return formatter.format(prev);
};

/** Time of day in Bogotá, 24h (e.g. 14:20). */
export const formatBogotaTimeHHmm = (iso: string): string => {
  const d = parseApiDateString(iso);
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);
};
