import "server-only";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildDigestForUser } from "@/lib/digest/aggregate";
import { renderDigest } from "@/lib/digest/email";
import { sendDigest } from "@/lib/digest/send";

// Run on Node so we can keep using @supabase/supabase-js with the service
// role and crypto. The edge runtime would also work but adds friction.
export const runtime = "nodejs";
// Defensive: never cached, never prerendered.
export const dynamic = "force-dynamic";

type SendOutcome = {
  userId: string;
  email: string;
  restaurantsCount: number;
  result: "sent" | "skipped" | "error" | "no_memberships";
  detail?: string;
};

function authorize(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured → only allow in dev (i.e., when not on Vercel).
    // On Vercel prod, refuse: better to noop than to expose the endpoint.
    return process.env.VERCEL !== "1";
  }
  // Vercel cron sets Authorization: Bearer <CRON_SECRET>. Also accept
  // ?secret= for manual triggers from a logged-in admin.
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;
  const qs = request.nextUrl.searchParams.get("secret");
  if (qs && qs === expected) return true;
  return false;
}

function lastWeekRange(): { fromIso: string; toIso: string } {
  const now = new Date();
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(to);
  from.setUTCDate(to.getUTCDate() - 7);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

async function resolveAppUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.trim().replace(/\/+$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { fromIso, toIso } = lastWeekRange();
  const appUrl = await resolveAppUrl();
  const fromEmail =
    process.env.DIGEST_FROM_EMAIL ?? "Reputation OS <onboarding@resend.dev>";

  // 1) Load opted-in prefs.
  const { data: prefs, error: prefsErr } = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id, unsubscribe_token, weekly_digest_enabled")
    .eq("weekly_digest_enabled", true);

  if (prefsErr) {
    return Response.json(
      { ok: false, error: prefsErr.message },
      { status: 500 },
    );
  }

  const optedIn = prefs ?? [];
  const userIds = optedIn.map((p) => p.user_id as string);
  if (userIds.length === 0) {
    return Response.json({ ok: true, processed: 0, outcomes: [] });
  }

  // 2) Resolve emails via the admin API. Iterate one-by-one — fine at MVP
  //    scale; if this grows we can paginate listUsers and join in memory.
  const emailByUserId = new Map<string, string>();
  for (const uid of userIds) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(uid);
    if (error || !data?.user?.email) continue;
    emailByUserId.set(uid, data.user.email);
  }

  // 3) For each user with an email, build + send.
  const outcomes: SendOutcome[] = [];

  for (const p of optedIn) {
    const userId = p.user_id as string;
    const email = emailByUserId.get(userId);
    if (!email) {
      outcomes.push({
        userId,
        email: "",
        restaurantsCount: 0,
        result: "error",
        detail: "no email on record",
      });
      continue;
    }

    const digest = await buildDigestForUser({
      userId,
      email,
      unsubscribeToken: p.unsubscribe_token as string,
      fromIso,
      toIso,
    });

    if (!digest || digest.restaurants.length === 0) {
      outcomes.push({
        userId,
        email,
        restaurantsCount: 0,
        result: "no_memberships",
      });
      continue;
    }

    const rendered = renderDigest(digest, { appUrl });
    const send = await sendDigest({
      to: email,
      from: fromEmail,
      email: rendered,
    });

    if (send.ok) {
      outcomes.push({
        userId,
        email,
        restaurantsCount: digest.restaurants.length,
        result: "sent",
        detail: send.id,
      });
      await supabaseAdmin.from("digest_log").insert({
        user_id: userId,
        sent_at: new Date().toISOString(),
        period_start: fromIso,
        period_end: toIso,
        restaurants_count: digest.restaurants.length,
      });
    } else {
      // Resend missing key is the common case in pre-launch — surface as
      // "skipped" not "error" so the dashboard isn't drowning in noise.
      const isSkip = send.error.includes("skipped");
      outcomes.push({
        userId,
        email,
        restaurantsCount: digest.restaurants.length,
        result: isSkip ? "skipped" : "error",
        detail: send.error,
      });
      if (!isSkip) {
        await supabaseAdmin.from("digest_log").insert({
          user_id: userId,
          sent_at: new Date().toISOString(),
          period_start: fromIso,
          period_end: toIso,
          restaurants_count: digest.restaurants.length,
          error: send.error,
        });
      }
    }
  }

  return Response.json({
    ok: true,
    processed: outcomes.length,
    fromIso,
    toIso,
    outcomes,
  });
}
