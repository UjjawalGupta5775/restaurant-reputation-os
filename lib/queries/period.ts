// Time-window filter for the restaurant analytics surface. URL search-param
// `?period=today|yesterday|7d|30d` is parsed via parsePeriod() in the page,
// then resolved to UTC bounds via periodRange() before hitting the DB.
//
// UTC throughout — the businesses table has no timezone column yet, so
// "Today" tracks UTC days. Acceptable for v1; revisit once we surface
// per-restaurant timezone.
//
// No "server-only" guard here: the period picker (client component) needs
// PERIOD_OPTIONS / parsePeriod() too. Pure functions, no secrets, safe to
// ship to the browser.

export type Period = "today" | "yesterday" | "7d" | "30d";

const PERIOD_VALUES: readonly Period[] = ["today", "yesterday", "7d", "30d"];

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export function isPeriod(value: unknown): value is Period {
  return (
    typeof value === "string" && (PERIOD_VALUES as readonly string[]).includes(value)
  );
}

export function parsePeriod(value: unknown): Period {
  return isPeriod(value) ? value : "30d";
}

export type PeriodRange = {
  fromIso: string;
  toIso: string;
  label: string;
  bucketCount: number;
};

function utcStartOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function periodRange(period: Period): PeriodRange {
  const startToday = utcStartOfToday();
  const now = new Date();

  if (period === "today") {
    return {
      fromIso: startToday.toISOString(),
      toIso: now.toISOString(),
      label: "Today",
      bucketCount: 1,
    };
  }
  if (period === "yesterday") {
    const startYesterday = new Date(startToday);
    startYesterday.setUTCDate(startYesterday.getUTCDate() - 1);
    return {
      fromIso: startYesterday.toISOString(),
      toIso: startToday.toISOString(),
      label: "Yesterday",
      bucketCount: 1,
    };
  }
  const days = period === "7d" ? 7 : 30;
  // Buckets cover today and (days - 1) prior days.
  const from = new Date(startToday);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return {
    fromIso: from.toISOString(),
    toIso: now.toISOString(),
    label: period === "7d" ? "Last 7 days" : "Last 30 days",
    bucketCount: days,
  };
}

export function periodLabel(period: Period): string {
  return periodRange(period).label;
}
