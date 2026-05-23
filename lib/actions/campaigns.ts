"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifySession, requireSuperAdmin } from "@/lib/dal";
import { slugify } from "@/lib/slug";

const scopeSchema = z.enum(["admin", "owner"]).default("owner");

const SOURCE_TYPES = [
  "table",
  "counter",
  "receipt",
  "poster",
  "delivery",
  "other",
] as const;

const campaignSchema = z.object({
  businessId: z.uuid("Invalid business id."),
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(80, "Name must be 80 characters or fewer."),
  sourceType: z.enum(SOURCE_TYPES),
  tableCode: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  staffCode: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type CampaignFormState =
  | {
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

const MAX_SLUG_TRIES = 25;

export async function createCampaign(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  const scope = scopeSchema.parse(formData.get("scope") ?? undefined);
  if (scope === "admin") {
    await requireSuperAdmin();
  } else {
    await verifySession();
  }
  const base = "/" + (scope === "admin" ? "admin" : "dashboard");

  const parsed = campaignSchema.safeParse({
    businessId: formData.get("businessId"),
    name: formData.get("name"),
    sourceType: formData.get("sourceType"),
    tableCode: formData.get("tableCode"),
    staffCode: formData.get("staffCode"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const { businessId, name, sourceType, tableCode, staffCode } = parsed.data;
  const baseSlug = slugify(name) || "campaign";
  const supabase = await createClient();

  for (let attempt = 0; attempt < MAX_SLUG_TRIES; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        business_id: businessId,
        name,
        slug: candidate,
        source_type: sourceType,
        table_code: tableCode ?? null,
        staff_code: staffCode ?? null,
      })
      .select("id")
      .single();

    if (!error && data) {
      revalidatePath(`${base}/restaurants/${businessId}`);
      redirect(`${base}/campaigns/${data.id}`);
    }

    if (error && error.code === "23505") continue;

    // 42501 = insufficient privilege; row-level security blocked the insert
    // (caller doesn't own that business). Surface a generic message.
    if (error && error.code === "42501") {
      return { error: "You don't have access to that restaurant." };
    }

    if (error) {
      return { error: error.message };
    }
  }

  return { error: "Could not find an available slug. Try a different name." };
}
