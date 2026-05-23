"use server";

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { FUNNEL_EVENTS, type FunnelEvent } from "@/lib/funnel/events";
import { checkRateLimit } from "@/lib/funnel/rate-limit";

const trackSchema = z.object({
  businessId: z.uuid(),
  campaignId: z.uuid().nullable().optional(),
  sessionId: z.uuid(),
  event: z.enum(FUNNEL_EVENTS),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TrackEventInput = {
  businessId: string;
  campaignId?: string | null;
  sessionId: string;
  event: FunnelEvent;
  metadata?: Record<string, unknown>;
};

export async function trackEvent(input: TrackEventInput): Promise<void> {
  const parsed = trackSchema.safeParse(input);
  if (!parsed.success) return;

  // Silent drop when over the bucket: events are fire-and-forget from the
  // client and the legitimate UX never inspects the return value, so a
  // bot hammering the action gets no signal that we dropped its writes.
  const rl = await checkRateLimit("event");
  if (!rl.allowed) return;

  try {
    const supabase = await createClient();
    await supabase.from("analytics_events").insert({
      business_id: parsed.data.businessId,
      campaign_id: parsed.data.campaignId ?? null,
      session_id: parsed.data.sessionId,
      event_type: parsed.data.event,
      metadata_json: parsed.data.metadata ?? {},
    });
  } catch (err) {
    // Analytics must never break the funnel. Swallow for UX, surface to
    // Sentry so a persistent insert failure doesn't go invisible.
    Sentry.captureException(err, { tags: { area: "analytics_insert" } });
  }
}
