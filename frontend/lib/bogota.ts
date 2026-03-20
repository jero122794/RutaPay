// frontend/lib/bogota.ts
import { parseISO } from "date-fns";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export const getBogotaTodayKey = (): string => {
  return formatter.format(new Date());
};

export const toBogotaDayKey = (value: string): string => {
  const d = parseISO(value);
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
  const d = parseISO(value);
  return formatBogotaDate(d);
};
