"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type UnsubscribeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function confirmUnsubscribe(
  token: string,
): Promise<UnsubscribeResult> {
  if (!token || token.length < 16) {
    return { ok: false, error: "Invalid unsubscribe token." };
  }

  // The RPC is SECURITY DEFINER and granted to anon — but we still call it
  // through the admin client so we don't lean on a per-request Supabase
  // session for what is, by design, an anonymous action.
  const { data, error } = await supabaseAdmin.rpc("unsubscribe_by_token", {
    p_token: token,
  });

  if (error) {
    return { ok: false, error: "Could not process your request. Try again later." };
  }

  if (data !== true) {
    return {
      ok: false,
      error: "This link is no longer valid. You may already be unsubscribed.",
    };
  }

  return { ok: true };
}
