import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type RestaurantDigestStats = {
  businessId: string;
  businessName: string;
  scans: number;
  ratings: number;
  avgRating: number | null;
  googleClicks: number;
  feedbackCount: number;
};

export type UserDigest = {
  userId: string;
  email: string;
  unsubscribeToken: string;
  periodStart: string;
  periodEnd: string;
  restaurants: RestaurantDigestStats[];
};

// Aggregate the last 7 days of activity for a single user across every
// restaurant they're a member of. Uses the service role intentionally —
// the cron caller has no user session, and the data we surface is the
// user's own. RLS is enforced at the application layer here: we filter
// strictly by the business_members rows for *this* user_id and never
// expose other users' data.
export async function buildDigestForUser(params: {
  userId: string;
  email: string;
  unsubscribeToken: string;
  fromIso: string;
  toIso: string;
}): Promise<UserDigest | null> {
  const { userId, email, unsubscribeToken, fromIso, toIso } = params;

  // 1) Which restaurants does this user own?
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId);

  if (memErr || !memberships || memberships.length === 0) {
    return null;
  }

  const businessIds = memberships.map((m) => m.business_id as string);

  // 2) Pull names for the restaurants.
  const { data: businesses, error: bizErr } = await supabaseAdmin
    .from("businesses")
    .select("id, name")
    .in("id", businessIds);

  if (bizErr || !businesses) return null;

  // 3) For each restaurant, compute the 5 stats. Run in parallel.
  const stats = await Promise.all(
    businesses.map(async (b) => {
      const businessId = b.id as string;

      const eventCount = async (eventType: string) => {
        const { count } = await supabaseAdmin
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("event_type", eventType)
          .gte("created_at", fromIso)
          .lt("created_at", toIso);
        return count ?? 0;
      };

      const [scans, ratings, googleClicks, feedbackRes, ratingRows] =
        await Promise.all([
          eventCount("scan_opened"),
          eventCount("stars_selected"),
          eventCount("google_redirect_clicked"),
          supabaseAdmin
            .from("feedback_submissions")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId)
            .gte("created_at", fromIso)
            .lt("created_at", toIso),
          supabaseAdmin
            .from("analytics_events")
            .select("metadata_json")
            .eq("business_id", businessId)
            .eq("event_type", "stars_selected")
            .gte("created_at", fromIso)
            .lt("created_at", toIso)
            .limit(5000),
        ]);

      let avgRating: number | null = null;
      if (ratingRows.data && ratingRows.data.length > 0) {
        const values: number[] = [];
        for (const row of ratingRows.data) {
          const meta = row.metadata_json as { rating?: unknown } | null;
          const r = meta?.rating;
          if (typeof r === "number" && r >= 1 && r <= 5) values.push(r);
        }
        if (values.length > 0) {
          avgRating =
            values.reduce((sum, n) => sum + n, 0) / values.length;
        }
      }

      return {
        businessId,
        businessName: b.name as string,
        scans,
        ratings,
        avgRating,
        googleClicks,
        feedbackCount: feedbackRes.count ?? 0,
      };
    }),
  );

  // Sort by scans desc so the busiest restaurant leads.
  stats.sort((a, b) => b.scans - a.scans);

  return {
    userId,
    email,
    unsubscribeToken,
    periodStart: fromIso,
    periodEnd: toIso,
    restaurants: stats,
  };
}
