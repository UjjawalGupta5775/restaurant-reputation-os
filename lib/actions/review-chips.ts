"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusinessAccess } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

export type ChipActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | undefined;

function collectFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

// Super-admins manage chips from /admin/restaurants/[id]/review-prompts;
// owners from /dashboard/restaurants/[id]/review-prompts. Both paths
// render the same manager, so every mutation has to bust both caches
// or the cross-role view stays stale until next navigation.
function revalidateChipPaths(businessId: string) {
  revalidatePath(`/dashboard/restaurants/${businessId}/review-prompts`);
  revalidatePath(`/admin/restaurants/${businessId}/review-prompts`);
}

// Soft validation: warn (not block) when the label looks subjective or
// coercive. The hard product rule against rating-neutral chips lives in
// PROJECT_CONTEXT.md; we still let the owner save what they want — this
// just nudges them away from "amazing/best/incredible" wording that
// pressures customers toward 5-star sentiment.
const COERCIVE_HINTS = [
  /\bamazing\b/i,
  /\bbest\b/i,
  /\bincredible\b/i,
  /\bperfect\b/i,
  /\bfantastic\b/i,
  /\bfive[ -]?stars?\b/i,
  /\b5[ -]?stars?\b/i,
  /\bawesome\b/i,
];

function softWarn(label: string): string | null {
  for (const re of COERCIVE_HINTS) {
    if (re.test(label)) {
      return "Heads-up: chips should be neutral observations (e.g. \"Wood-fired crust\"), not sentiment prompts. Saved anyway — edit later if you change your mind.";
    }
  }
  return null;
}

const labelSchema = z
  .string()
  .trim()
  .min(2, "Use 2–40 characters.")
  .max(40, "Use 2–40 characters.");

const createSchema = z.object({
  businessId: z.uuid(),
  label: labelSchema,
});

const updateSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  label: labelSchema,
  isActive: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

const toggleSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  // Target state — what we want is_active to become. Posting the desired
  // value (rather than the current one) keeps the toggle idempotent under
  // double-submits.
  next: z.union([z.literal("true"), z.literal("false")]),
});

const deleteSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
});

const reorderSchema = z.object({
  businessId: z.uuid(),
  // JSON-encoded ordered list of chip ids. Form actions can't natively
  // POST an array, so the client serialises to a string and we parse here.
  orderJson: z.string().min(2),
});

const settingsSchema = z.object({
  businessId: z.uuid(),
  displayMode: z.enum(["manual", "random"]),
  displayLimit: z.coerce.number().int().min(4).max(16),
});

export async function createChip(
  _prev: ChipActionState,
  formData: FormData,
): Promise<ChipActionState> {
  const parsed = createSchema.safeParse({
    businessId: formData.get("businessId"),
    label: formData.get("label"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  await requireBusinessAccess(parsed.data.businessId);

  const supabase = await createClient();
  // New chips land at the bottom of the active list. We compute next
  // position from a single max() roundtrip rather than a coalesced
  // subquery — keeps the SQL readable and the table is bounded (owners
  // realistically won't exceed ~30 chips).
  const { data: maxRow } = await supabase
    .from("review_chips")
    .select("position")
    .eq("business_id", parsed.data.businessId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("review_chips").insert({
    business_id: parsed.data.businessId,
    label: parsed.data.label,
    position: nextPosition,
  });

  if (error) {
    return { ok: false, error: "Could not save the chip." };
  }

  revalidateChipPaths(parsed.data.businessId);
  return {
    ok: true,
    message: softWarn(parsed.data.label) ?? "Chip added.",
  };
}

export async function updateChip(
  _prev: ChipActionState,
  formData: FormData,
): Promise<ChipActionState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    businessId: formData.get("businessId"),
    label: formData.get("label"),
    isActive: formData.get("isActive") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  await requireBusinessAccess(parsed.data.businessId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("review_chips")
    .update({
      label: parsed.data.label,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.id)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    return { ok: false, error: "Could not update the chip." };
  }

  revalidateChipPaths(parsed.data.businessId);
  return { ok: true, message: softWarn(parsed.data.label) ?? "Chip updated." };
}

// Standalone toggle so the row's on/off switch doesn't have to round-trip
// the label field — keeps the form payload tiny and avoids accidental
// label edits when the owner just wanted to hide a chip.
export async function toggleChip(
  _prev: ChipActionState,
  formData: FormData,
): Promise<ChipActionState> {
  const parsed = toggleSchema.safeParse({
    id: formData.get("id"),
    businessId: formData.get("businessId"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  await requireBusinessAccess(parsed.data.businessId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("review_chips")
    .update({ is_active: parsed.data.next === "true" })
    .eq("id", parsed.data.id)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    return { ok: false, error: "Could not update the chip." };
  }

  revalidateChipPaths(parsed.data.businessId);
  return { ok: true };
}

export async function deleteChip(
  _prev: ChipActionState,
  formData: FormData,
): Promise<ChipActionState> {
  const parsed = deleteSchema.safeParse({
    id: formData.get("id"),
    businessId: formData.get("businessId"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  await requireBusinessAccess(parsed.data.businessId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("review_chips")
    .delete()
    .eq("id", parsed.data.id)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    return { ok: false, error: "Could not delete the chip." };
  }

  revalidateChipPaths(parsed.data.businessId);
  return { ok: true, message: "Chip deleted." };
}

// Bulk position rewrite. The client posts the new ordering as a JSON
// array of chip ids; we map each id to its index. Done with one UPDATE
// per row because Supabase's REST client doesn't expose bulk-upsert
// with a partial column list — and the row count is small.
export async function reorderChips(
  _prev: ChipActionState,
  formData: FormData,
): Promise<ChipActionState> {
  const parsed = reorderSchema.safeParse({
    businessId: formData.get("businessId"),
    orderJson: formData.get("orderJson"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  let ids: string[];
  try {
    const raw = JSON.parse(parsed.data.orderJson) as unknown;
    if (!Array.isArray(raw) || !raw.every((v) => typeof v === "string")) {
      return { ok: false, error: "Invalid order payload." };
    }
    ids = raw as string[];
  } catch {
    return { ok: false, error: "Invalid order payload." };
  }

  if (ids.length === 0) {
    return { ok: true };
  }

  await requireBusinessAccess(parsed.data.businessId);

  const supabase = await createClient();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("review_chips")
      .update({ position: i })
      .eq("id", ids[i])
      .eq("business_id", parsed.data.businessId);
    if (error) {
      return { ok: false, error: "Could not save the new order." };
    }
  }

  revalidateChipPaths(parsed.data.businessId);
  return { ok: true, message: "Order saved." };
}

export async function updateChipSettings(
  _prev: ChipActionState,
  formData: FormData,
): Promise<ChipActionState> {
  const parsed = settingsSchema.safeParse({
    businessId: formData.get("businessId"),
    displayMode: formData.get("displayMode"),
    displayLimit: formData.get("displayLimit"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  await requireBusinessAccess(parsed.data.businessId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      chip_display_mode: parsed.data.displayMode,
      chip_display_limit: parsed.data.displayLimit,
    })
    .eq("id", parsed.data.businessId);

  if (error) {
    return { ok: false, error: "Could not save display settings." };
  }

  revalidateChipPaths(parsed.data.businessId);
  return { ok: true, message: "Display settings saved." };
}
