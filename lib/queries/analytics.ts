import "server-only";
import { createClient } from "@/lib/supabase/server";
import { periodRange, type Period } from "./period";

const AVG_RATING_SAMPLE_CAP = 5000;
const TIMING_SAMPLE_CAP = 5000;

export type RestaurantKpis = {
  windowScans: number;
  windowRatings: number;
  windowAvgRating: number | null;
  windowGoogleClicks: number;
  windowFeedback: number;
  allTimeScans: number;
  allTimeRatings: number;
  allTimeFeedback: number;
};

export async function getRestaurantKpis(
  businessId: string,
  period: Period = "30d",
): Promise<RestaurantKpis> {
  const supabase = await createClient();
  const { fromIso, toIso } = periodRange(period);

  const eventCount = (eventType: string, windowed: boolean) => {
    let q = supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("event_type", eventType);
    if (windowed) q = q.gte("created_at", fromIso).lt("created_at", toIso);
    return q;
  };

  const feedbackCount = (windowed: boolean) => {
    let q = supabase
      .from("feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);
    if (windowed) q = q.gte("created_at", fromIso).lt("created_at", toIso);
    return q;
  };

  const [
    scansWin,
    ratingsWin,
    googleClicksWin,
    feedbackWin,
    scansAll,
    ratingsAll,
    feedbackAll,
    avgRows,
  ] = await Promise.all([
    eventCount("scan_opened", true),
    eventCount("stars_selected", true),
    eventCount("google_redirect_clicked", true),
    feedbackCount(true),
    eventCount("scan_opened", false),
    eventCount("stars_selected", false),
    feedbackCount(false),
    supabase
      .from("analytics_events")
      .select("metadata_json")
      .eq("business_id", businessId)
      .eq("event_type", "stars_selected")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(AVG_RATING_SAMPLE_CAP),
  ]);

  let avgRating: number | null = null;
  if (!avgRows.error && avgRows.data && avgRows.data.length > 0) {
    const ratings: number[] = [];
    for (const row of avgRows.data) {
      const meta = row.metadata_json as { rating?: unknown } | null;
      const r = meta?.rating;
      if (typeof r === "number" && r >= 1 && r <= 5) ratings.push(r);
    }
    if (ratings.length > 0) {
      avgRating =
        ratings.reduce((sum, n) => sum + n, 0) / ratings.length;
    }
  }

  return {
    windowScans: scansWin.count ?? 0,
    windowRatings: ratingsWin.count ?? 0,
    windowAvgRating: avgRating,
    windowGoogleClicks: googleClicksWin.count ?? 0,
    windowFeedback: feedbackWin.count ?? 0,
    allTimeScans: scansAll.count ?? 0,
    allTimeRatings: ratingsAll.count ?? 0,
    allTimeFeedback: feedbackAll.count ?? 0,
  };
}

export type DailyScan = {
  date: string;
  scans: number;
};

export async function getDailyScans(
  businessId: string,
  period: Period = "30d",
): Promise<DailyScan[]> {
  const supabase = await createClient();
  const { fromIso, toIso, bucketCount } = periodRange(period);

  const { data, error } = await supabase
    .from("analytics_events")
    .select("created_at")
    .eq("business_id", businessId)
    .eq("event_type", "scan_opened")
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .limit(10000);

  if (error) throw error;

  // Anchor buckets on the UTC day of `fromIso` so single-day periods
  // (today, yesterday) place their one bucket on the correct date.
  const buckets = new Map<string, number>();
  const fromDate = new Date(fromIso);
  for (let i = 0; i < bucketCount; i++) {
    const d = new Date(fromDate);
    d.setUTCDate(d.getUTCDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of data ?? []) {
    const key = (row.created_at as string).slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([date, scans]) => ({
    date,
    scans,
  }));
}

export type FunnelTiming = {
  // Median ms from scan_opened to stars_selected — the single most
  // important number against the 20s funnel target.
  medianTimeToRateMs: number | null;
  // Median ms from scan_opened to a terminal step (google_redirect_clicked
  // or feedback_submitted), whichever the customer actually reached.
  medianTimeToCompleteMs: number | null;
  rateSampleCount: number;
  completeSampleCount: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function collectElapsedMs(
  rows: { metadata_json: unknown }[] | null,
): number[] {
  if (!rows) return [];
  const out: number[] = [];
  for (const row of rows) {
    const meta = row.metadata_json as { elapsedMs?: unknown } | null;
    const v = meta?.elapsedMs;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out.push(v);
  }
  return out;
}

export async function getFunnelTiming(
  businessId: string,
  period: Period = "30d",
): Promise<FunnelTiming> {
  const supabase = await createClient();
  const { fromIso, toIso } = periodRange(period);

  const timingRows = (eventType: string) =>
    supabase
      .from("analytics_events")
      .select("metadata_json")
      .eq("business_id", businessId)
      .eq("event_type", eventType)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(TIMING_SAMPLE_CAP);

  const [rateRows, googleRows, feedbackRows] = await Promise.all([
    timingRows("stars_selected"),
    timingRows("google_redirect_clicked"),
    timingRows("feedback_submitted"),
  ]);

  const rateMs = collectElapsedMs(rateRows.data ?? null);
  const completeMs = [
    ...collectElapsedMs(googleRows.data ?? null),
    ...collectElapsedMs(feedbackRows.data ?? null),
  ];

  return {
    medianTimeToRateMs: median(rateMs),
    medianTimeToCompleteMs: median(completeMs),
    rateSampleCount: rateMs.length,
    completeSampleCount: completeMs.length,
  };
}
