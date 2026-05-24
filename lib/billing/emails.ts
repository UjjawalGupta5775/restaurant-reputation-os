import type { BillingEventKind } from "@/lib/billing/provider";

// Render the per-event email body the signup user receives on top of
// whatever Lemon Squeezy delivers. LS already sends a receipt to the
// billing email and a sale notification to the store owner — these
// templates fill the third gap: the signup user (which may or may not
// match the billing email) gets an at-a-glance state update for the
// account they actually own.
//
// Two kinds get NO email at all and are not represented here:
//   - subscription_created: the LS receipt covers "welcome / receipt".
//     Sending a second mail would just be noise.
//   - subscription_payment_success: would fire on every renewal —
//     drowns the inbox and adds no value beyond the LS receipt.
//
// All other state-changing kinds get a short, calm message with the
// resolution path. Tone matches deriveBanner: info > warn > critical.

export type RenderedBillingEmail = {
  subject: string;
  html: string;
  text: string;
};

export type BillingEmailInput = {
  kind: BillingEventKind;
  businessName: string;
  // Anchor timestamps the email may reference, when applicable.
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAt: string | null;
  appUrl: string;
  businessId: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Copy = {
  subject: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaPath: string; // appended to appUrl
};

// One copy block per kind we actually email about. Returning null
// signals "no email for this kind" so the dispatcher can short-circuit
// without a thrown branch.
function copyFor(input: BillingEmailInput): Copy | null {
  const dashPath = `/dashboard/restaurants/${input.businessId}`;
  const name = input.businessName;

  switch (input.kind) {
    case "subscription_payment_failed": {
      return {
        subject: `Action needed — payment failed for ${name}`,
        headline: "Payment failed",
        body: `We couldn't charge your card for ${name}. Update your payment method to keep the dashboard active. We'll keep trying in the meantime.`,
        ctaLabel: "Update payment",
        ctaPath: dashPath,
      };
    }
    case "subscription_payment_recovered": {
      return {
        subject: `Payment recovered for ${name}`,
        headline: "Payment recovered",
        body: `Good news — your payment for ${name} went through. Your subscription is back in good standing.`,
        ctaLabel: "Open dashboard",
        ctaPath: dashPath,
      };
    }
    case "subscription_canceled": {
      const endDate = formatDate(input.cancelAt) ?? formatDate(input.currentPeriodEndsAt);
      const ending = endDate
        ? `Your access will end on ${endDate}. `
        : "";
      return {
        subject: `Subscription canceled for ${name}`,
        headline: "Subscription canceled",
        body: `${ending}If this wasn't intentional, you can resume from the billing portal.`,
        ctaLabel: "Manage billing",
        ctaPath: dashPath,
      };
    }
    case "subscription_resumed": {
      return {
        subject: `Subscription resumed for ${name}`,
        headline: "Subscription resumed",
        body: `${name} is back on. Thanks for sticking with us — nothing else to do.`,
        ctaLabel: "Open dashboard",
        ctaPath: dashPath,
      };
    }
    case "subscription_expired": {
      return {
        subject: `Subscription ended for ${name}`,
        headline: "Subscription ended",
        body: `Your subscription for ${name} has ended. Restart whenever you're ready — your campaigns and history are preserved.`,
        ctaLabel: "Restart subscription",
        ctaPath: dashPath,
      };
    }
    case "subscription_paused": {
      return {
        subject: `Subscription paused for ${name}`,
        headline: "Subscription paused",
        body: `${name} is paused. Resume from the billing portal whenever you're ready.`,
        ctaLabel: "Manage billing",
        ctaPath: dashPath,
      };
    }
    case "subscription_unpaused": {
      return {
        subject: `Subscription active again for ${name}`,
        headline: "Subscription active",
        body: `${name} is unpaused and active. Nothing else to do.`,
        ctaLabel: "Open dashboard",
        ctaPath: dashPath,
      };
    }
    case "subscription_updated":
    case "subscription_created":
    case "subscription_payment_success":
      return null;
  }
}

export function shouldEmailForKind(kind: BillingEventKind): boolean {
  return copyFor({
    kind,
    businessName: "x",
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    cancelAt: null,
    appUrl: "x",
    businessId: "x",
  }) !== null;
}

export function renderBillingEmail(
  input: BillingEmailInput,
): RenderedBillingEmail | null {
  const copy = copyFor(input);
  if (!copy) return null;

  const ctaUrl = `${input.appUrl.replace(/\/$/, "")}${copy.ctaPath}`;
  const safeName = escapeHtml(input.businessName);
  const safeHeadline = escapeHtml(copy.headline);
  const safeBody = escapeHtml(copy.body);
  const safeCta = escapeHtml(copy.ctaLabel);

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${safeName}</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">${safeHeadline}</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.55;">${safeBody}</p>
              <p style="margin:0;">
                <a href="${ctaUrl}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;">${safeCta}</a>
              </p>
              <p style="margin:32px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
                Or open your dashboard directly:
                <a href="${ctaUrl}" style="color:#0a0a0a;">${ctaUrl}</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
          You're getting this because you own ${safeName} on Reputation OS.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${input.businessName} — ${copy.headline}`,
    "",
    copy.body,
    "",
    `${copy.ctaLabel}: ${ctaUrl}`,
  ].join("\n");

  return { subject: copy.subject, html, text };
}
