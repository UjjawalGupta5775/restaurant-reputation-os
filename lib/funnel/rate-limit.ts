import "server-only";

import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

type Bucket = "feedback" | "event";

const LIMITS: Record<Bucket, { max: number; windowSeconds: number }> = {
  // Legit submissions per IP are ~1 per visit. Allow a group at one table
  // (family of 8) all submitting within an hour from the same WiFi without
  // tripping; anything faster is almost certainly a script.
  feedback: { max: 8, windowSeconds: 60 * 60 },
  // A complete funnel run emits ~10 events in ~20 seconds. 300/min/IP
  // supports ~30 concurrent funnels on one IP — fine for shared restaurant
  // WiFi at peak, but cuts off a scraper hammering the action.
  event: { max: 300, windowSeconds: 60 },
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function pickIp(forwardedFor: string | null, realIp: string | null): string {
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }
  return "unknown";
}

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? "rros-funnel-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function checkRateLimit(bucket: Bucket): Promise<RateLimitResult> {
  const h = await headers();
  const ip = pickIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const key = `${bucket}:${hashIp(ip)}`;
  const { max, windowSeconds } = LIMITS[bucket];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_funnel_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error || !data || data.length === 0) {
      // Soft-fail: never take down the funnel because the rate-limit
      // table is unhappy. Allow the request through but log so we notice.
      if (error) {
        console.warn("[rate-limit] rpc error, allowing:", error.message);
        Sentry.captureMessage(`rate-limit rpc error: ${error.message}`, {
          level: "warning",
          tags: { area: "rate_limit", bucket },
        });
      }
      return { allowed: true };
    }
    const row = data[0] as { allowed: boolean; retry_after_seconds: number };
    if (row.allowed) return { allowed: true };
    return { allowed: false, retryAfterSeconds: row.retry_after_seconds };
  } catch (err) {
    console.warn("[rate-limit] threw, allowing:", err);
    Sentry.captureException(err, { tags: { area: "rate_limit", bucket } });
    return { allowed: true };
  }
}
