"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { requireBusinessAccess } from "@/lib/dal";
import { getBillingProvider } from "@/lib/billing";
import { getSubscriptionForBusiness } from "@/lib/queries/subscriptions";

// Billing server actions used by owner-facing UI. Two surfaces:
//
//   - startCheckout(businessId, returnPath)
//       Creates a fresh provider checkout URL and redirects the owner
//       to it. The owner's auth context is gated by requireBusinessAccess.
//
//   - openCustomerPortal(businessId, returnPath)
//       Looks up the active provider_subscription_id and fetches a
//       fresh (signed, 24h) portal URL, then redirects. If there's no
//       provider subscription yet (still in trial without a checkout),
//       falls back to startCheckout.
//
// V1 enforcement is banner-only — these actions do NOT block on
// hasOperationalAccess. The owner can always click "manage billing"
// even if the sub is past_due; the portal is where they fix it.

const businessIdSchema = z.uuid();

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  )
    .trim()
    .replace(/\/+$/, "");
}

export async function startCheckout(
  businessId: string,
  returnPath?: string,
): Promise<never> {
  const parsedId = businessIdSchema.safeParse(businessId);
  if (!parsedId.success) redirect("/dashboard");

  const session = await requireBusinessAccess(parsedId.data);
  const provider = getBillingProvider();

  if (!provider.isConfigured()) {
    Sentry.captureMessage("startCheckout invoked but provider not configured", {
      level: "warning",
      tags: { area: "billing" },
    });
    redirect("/dashboard");
  }

  const safeReturn =
    returnPath && returnPath.startsWith("/")
      ? returnPath
      : `/dashboard/restaurants/${parsedId.data}`;
  const successRedirectUrl = `${siteOrigin()}${safeReturn}?billing=complete`;

  let url: string;
  try {
    const result = await provider.createCheckoutUrl({
      businessId: parsedId.data,
      userId: session.userId,
      customerEmail: session.email ?? null,
      successRedirectUrl,
    });
    url = result.url;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "billing", op: "startCheckout" },
      extra: { businessId: parsedId.data },
    });
    redirect("/dashboard?billing=error");
  }

  redirect(url);
}

export async function openCustomerPortal(
  businessId: string,
  returnPath?: string,
): Promise<never> {
  const parsedId = businessIdSchema.safeParse(businessId);
  if (!parsedId.success) redirect("/dashboard");

  await requireBusinessAccess(parsedId.data);
  const provider = getBillingProvider();

  if (!provider.isConfigured()) {
    Sentry.captureMessage("openCustomerPortal invoked but provider not configured", {
      level: "warning",
      tags: { area: "billing" },
    });
    redirect("/dashboard");
  }

  const sub = await getSubscriptionForBusiness(parsedId.data);
  if (!sub?.providerSubscriptionId) {
    // No provider-side subscription yet — bounce to checkout so the
    // owner can start one. Common during the trial-before-checkout phase.
    await startCheckout(parsedId.data, returnPath);
    // startCheckout always redirects, so the line below is unreachable —
    // but TS doesn't know that without a `never` return type round-trip.
    redirect("/dashboard");
  }

  let url: string;
  try {
    const result = await provider.getCustomerPortal({
      providerSubscriptionId: sub.providerSubscriptionId,
    });
    url = result.customerPortalUrl;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "billing", op: "openCustomerPortal" },
      extra: { businessId: parsedId.data },
    });
    redirect("/dashboard?billing=error");
  }

  redirect(url);
}
