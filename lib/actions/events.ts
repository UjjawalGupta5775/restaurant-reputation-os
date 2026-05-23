"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FUNNEL_EVENTS, type FunnelEvent } from "@/lib/funnel/events";

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

  try {
    const supabase = await createClient();
    await supabase.from("analytics_events").insert({
      business_id: parsed.data.businessId,
      campaign_id: parsed.data.campaignId ?? null,
      session_id: parsed.data.sessionId,
      event_type: parsed.data.event,
      metadata_json: parsed.data.metadata ?? {},
    });
  } catch {
    // Analytics must never break the funnel. Swallow.
  }
}
