"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifySession } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

const toggleSchema = z.object({
  enabled: z.coerce.boolean(),
});

export type NotificationPrefsState =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string }
  | undefined;

export async function setWeeklyDigestEnabled(
  _prev: NotificationPrefsState,
  formData: FormData,
): Promise<NotificationPrefsState> {
  const session = await verifySession();

  const parsed = toggleSchema.safeParse({
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const supabase = await createClient();

  // Upsert via the user's RLS-scoped client. The RLS policies on
  // notification_preferences allow self insert + self update; the
  // primary key is user_id so this is one row per user.
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: session.userId,
        weekly_digest_enabled: parsed.data.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    return { ok: false, error: "Could not update your preferences." };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, enabled: parsed.data.enabled };
}
