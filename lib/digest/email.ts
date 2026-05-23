import "server-only";

import type { UserDigest } from "./aggregate";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateRange(fromIso: string, toIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  // toIso is exclusive — subtract a day for display so "Jun 1–Jun 7" reads
  // as a closed weeklong range to the human reader.
  const toDisplay = new Date(toIso);
  toDisplay.setUTCDate(toDisplay.getUTCDate() - 1);
  return `${fmt(fromIso)} – ${fmt(toDisplay.toISOString())}`;
}

function avgFormat(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1) + " ★";
}

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

// Plain HTML — no React Email dep. Inline-styled because email clients vary
// in their CSS support. Kept legible and minimal: a calm summary, not a
// dashboard. Hard rule: never promise auto-posting, never include rating-
// gated content, just numbers + a link.
export function renderDigest(
  digest: UserDigest,
  options: { appUrl: string },
): RenderedEmail {
  const dateRange = formatDateRange(digest.periodStart, digest.periodEnd);

  const totalScans = digest.restaurants.reduce((sum, r) => sum + r.scans, 0);
  const totalFeedback = digest.restaurants.reduce(
    (sum, r) => sum + r.feedbackCount,
    0,
  );

  const restaurantCount = digest.restaurants.length;
  const restaurantWord = restaurantCount === 1 ? "restaurant" : "restaurants";

  const subject = `Your weekly summary (${dateRange})`;

  const unsubscribeUrl = `${options.appUrl}/unsubscribe?token=${digest.unsubscribeToken}`;

  const tableRows = digest.restaurants
    .map((r) => {
      const detailUrl = `${options.appUrl}/dashboard/restaurants/${r.businessId}`;
      const safeName = escapeHtml(r.businessName);
      return `
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;">
            <a href="${detailUrl}" style="color:#0a0a0a;text-decoration:none;font-weight:600;">${safeName}</a>
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${r.scans}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${r.ratings}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${avgFormat(r.avgRating)}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${r.googleClicks}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${r.feedbackCount}</td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr>
            <td>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Your weekly summary</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">${dateRange}</p>

              <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
                Last week your ${restaurantWord} saw
                <strong>${totalScans}</strong> ${totalScans === 1 ? "scan" : "scans"}
                and
                <strong>${totalFeedback}</strong> private
                ${totalFeedback === 1 ? "submission" : "submissions"}.
                Detailed numbers below.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr>
                    <th style="padding:8px;text-align:left;border-bottom:2px solid #0a0a0a;font-weight:600;">Restaurant</th>
                    <th style="padding:8px;text-align:right;border-bottom:2px solid #0a0a0a;font-weight:600;">Scans</th>
                    <th style="padding:8px;text-align:right;border-bottom:2px solid #0a0a0a;font-weight:600;">Ratings</th>
                    <th style="padding:8px;text-align:right;border-bottom:2px solid #0a0a0a;font-weight:600;">Avg</th>
                    <th style="padding:8px;text-align:right;border-bottom:2px solid #0a0a0a;font-weight:600;">Google</th>
                    <th style="padding:8px;text-align:right;border-bottom:2px solid #0a0a0a;font-weight:600;">Private</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>

              <p style="margin:32px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
                Open the dashboard for full charts and recent feedback:
                <a href="${options.appUrl}/dashboard" style="color:#0a0a0a;">${options.appUrl}/dashboard</a>
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
          You're getting this because you have an account on Reputation OS.<br/>
          <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from weekly summaries</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text version for clients that suppress HTML or for accessibility.
  const textLines = [
    `Your weekly summary — ${dateRange}`,
    "",
    `${totalScans} ${totalScans === 1 ? "scan" : "scans"}, ${totalFeedback} private ${totalFeedback === 1 ? "submission" : "submissions"} across ${restaurantCount} ${restaurantWord}.`,
    "",
    "Restaurant breakdown:",
    ...digest.restaurants.map(
      (r) =>
        `- ${r.businessName}: ${r.scans} scans, ${r.ratings} ratings, avg ${avgFormat(r.avgRating)}, ${r.googleClicks} Google clicks, ${r.feedbackCount} private`,
    ),
    "",
    `Dashboard: ${options.appUrl}/dashboard`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ];
  const text = textLines.join("\n");

  return { subject, html, text };
}
