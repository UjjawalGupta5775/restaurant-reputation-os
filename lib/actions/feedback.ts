"use server";

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/funnel/rate-limit";

const feedbackSchema = z.object({
  businessId: z.uuid("Invalid business id."),
  campaignId: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((v) => (v && v !== "" ? v : undefined)),
  sessionId: z.uuid("Invalid session id."),
  rating: z.coerce.number().int().min(1).max(5),
  feedbackText: z
    .string()
    .trim()
    .max(2000, "Feedback must be 2000 characters or fewer.")
    .optional()
    .transform((v) => (v && v !== "" ? v : undefined)),
  contactName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v !== "" ? v : undefined)),
  contactPhone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v !== "" ? v : undefined)),
  // Client-measured ms from scan_opened to form submit. Optional so
  // older clients / bots without the field still pass validation. Cap
  // at 24h to drop bogus values; we store it for funnel-speed metrics.
  // Empty-string and missing values both surface as `undefined` (not 0).
  elapsedMs: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z
      .number()
      .int()
      .min(0)
      .max(24 * 60 * 60 * 1000)
      .optional(),
  ),
});

export type FeedbackFormState =
  | {
      ok?: boolean;
      error?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | undefined;

function collectFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export async function submitFeedback(
  _prev: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  // Rate limit before any work (including the honeypot check) — both
  // honeypot-tripping bots and legit submissions count toward the same
  // bucket. If you're hammering, you're hammering, regardless of intent.
  const rl = await checkRateLimit("feedback");
  if (!rl.allowed) {
    return {
      error: "Too many submissions from this network. Please try again in a few minutes.",
    };
  }

  // Honeypot — a hidden "website" field rendered off-screen. Real users
  // never fill it; naive form-spam bots usually do. If non-empty, pretend
  // the submission succeeded (so the bot doesn't retry with a workaround)
  // but skip the database write and the analytics event.
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return { ok: true };
  }

  const parsed = feedbackSchema.safeParse({
    businessId: formData.get("businessId"),
    campaignId: formData.get("campaignId") ?? undefined,
    sessionId: formData.get("sessionId"),
    rating: formData.get("rating"),
    feedbackText: formData.get("feedbackText"),
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone"),
    elapsedMs: formData.get("elapsedMs") ?? undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const data = parsed.data;

  if (!data.feedbackText && !data.contactName && !data.contactPhone) {
    return {
      fieldErrors: {
        feedbackText: ["Add a comment or contact info before sending."],
      },
    };
  }

  const supabase = await createClient();

  const { error: insertError } = await supabase
    .from("feedback_submissions")
    .insert({
      business_id: data.businessId,
      campaign_id: data.campaignId ?? null,
      rating: data.rating,
      feedback_text: data.feedbackText ?? null,
      contact_name: data.contactName ?? null,
      contact_phone: data.contactPhone ?? null,
    });

  if (insertError) {
    return { error: "Could not send feedback. Please try again." };
  }

  // Same-action emit so feedback_submitted only fires when the row actually
  // wrote. Failure here is silent — the customer-visible outcome already
  // succeeded.
  try {
    await supabase.from("analytics_events").insert({
      business_id: data.businessId,
      campaign_id: data.campaignId ?? null,
      session_id: data.sessionId,
      event_type: "feedback_submitted",
      metadata_json: {
        rating: data.rating,
        hasText: Boolean(data.feedbackText),
        hasContact: Boolean(data.contactName || data.contactPhone),
        ...(data.elapsedMs !== undefined ? { elapsedMs: data.elapsedMs } : {}),
      },
    });
  } catch (err) {
    // Feedback row already wrote; only the analytics emit failed. Don't
    // bubble to the customer but tell Sentry so a persistent insert
    // failure doesn't go invisible.
    Sentry.captureException(err, { tags: { area: "analytics_insert", event: "feedback_submitted" } });
  }

  return { ok: true };
}
