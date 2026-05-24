import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_REVIEW_CHIPS } from "@/lib/funnel/chips";

export type ReviewChip = {
  id: string;
  label: string;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChipSettings = {
  displayMode: "manual" | "random";
  displayLimit: number;
};

// listChipsForOwner — every chip on the business, regardless of active
// state. Used by the owner UI to render the management table.
export async function listChipsForOwner(
  businessId: string,
): Promise<ReviewChip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("review_chips")
    .select("id, label, position, is_active, created_at, updated_at")
    .eq("business_id", businessId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    position: row.position as number,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

// listActiveChipsForCustomer — only active chips, owner-ordered. Used
// by the customer funnel on /r/[slug]. Falls back to the platform-
// default labels if a business has no rows at all (defensive — the
// after-insert trigger should ensure every business has 8 defaults,
// but if a deletion script ever leaves a business chipless we still
// want to show something).
export async function listActiveChipsForCustomer(
  businessId: string,
): Promise<Array<{ id: string; label: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("review_chips")
    .select("id, label")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  if (!data || data.length === 0) {
    return DEFAULT_REVIEW_CHIPS.map((label, i) => ({
      id: `default-${i}`,
      label,
    }));
  }

  return data.map((row) => ({
    id: row.id as string,
    label: row.label as string,
  }));
}

// getChipSettings — display mode + limit for the business. Lives on
// the businesses row, not the chips. Defaults are sane (manual, 8)
// so missing/uninitialised businesses behave identically to the
// pre-feature hardcoded experience.
export async function getChipSettings(
  businessId: string,
): Promise<ChipSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("chip_display_mode, chip_display_limit")
    .eq("id", businessId)
    .maybeSingle();

  if (error) throw error;

  const mode = (data?.chip_display_mode as string | undefined) === "random"
    ? "random"
    : "manual";
  const rawLimit = data?.chip_display_limit as number | undefined;
  const limit =
    typeof rawLimit === "number" && rawLimit >= 4 && rawLimit <= 16
      ? rawLimit
      : 8;

  return { displayMode: mode, displayLimit: limit };
}
