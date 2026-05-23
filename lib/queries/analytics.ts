import "server-only";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_WINDOW_DAYS = 30;
const AVG_RATING_SAMPLE_CAP = 5000;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export type RestaurantKpis = {
  thirtyDayScans: number;
  thirtyDayRatings: number;
  thirtyDayAvgRating: number | null;
  thirtyDayGoogleClicks: number;
  thirtyDayFeedback: number;
  allTimeScans: number;
  allTimeRatings: number;
  allTimeFeedback: number;
};

export async function getRestaurantKpis(
  businessId: string,
): Promise<RestaurantKpis> {
  const supabase = await createClient();
  const since = daysAgoIso(DEFAULT_WINDOW_DAYS);

  const eventCount = (eventType: string, sinceFilter: boolean) => {
    let q = supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("event_type", eventType);
    if (sinceFilter) q = q.gte("created_at", since);
    return q;
  };

  const feedbackCount = (sinceFilter: boolean) => {
    let q = supabase
      .from("feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);
    if (sinceFilter) q = q.gte("created_at", since);
    return q;
  };

  const [
    scans30,
    ratings30,
    googleClicks30,
    feedback30,
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
      .gte("created_at", since)
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
    thirtyDayScans: scans30.count ?? 0,
    thirtyDayRatings: ratings30.count ?? 0,
    thirtyDayAvgRating: avgRating,
    thirtyDayGoogleClicks: googleClicks30.count ?? 0,
    thirtyDayFeedback: feedback30.count ?? 0,
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
  days = DEFAULT_WINDOW_DAYS,
): Promise<DailyScan[]> {
  const supabase = await createClient();
  const since = daysAgoIso(days);

  const { data, error } = await supabase
    .from("analytics_events")
    .select("created_at")
    .eq("business_id", businessId)
    .eq("event_type", "scan_opened")
    .gte("created_at", since)
    .limit(10000);

  if (error) throw error;

  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
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
