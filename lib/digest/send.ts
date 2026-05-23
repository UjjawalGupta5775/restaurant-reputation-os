import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { RenderedEmail } from "./email";

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

// Resend wrapper kept tiny on purpose. If RESEND_API_KEY isn't set we don't
// fail — the digest job logs "skipped" and the rest of the system carries
// on. This lets the cron be wired up before credentials are configured.
export async function sendDigest(params: {
  to: string;
  from: string;
  email: RenderedEmail;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set (skipped)" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: params.from,
        to: params.to,
        subject: params.email.subject,
        html: params.email.html,
        text: params.email.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `Resend ${res.status}: ${body.slice(0, 200)}`;
      Sentry.captureMessage(error, {
        level: "error",
        tags: { area: "digest_send", status: String(res.status) },
      });
      return { ok: false, error };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? "unknown" };
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "digest_send" } });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown send error",
    };
  }
}
