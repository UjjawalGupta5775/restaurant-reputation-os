"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireBusinessAccess,
  requireSuperAdmin,
  verifySession,
} from "@/lib/dal";
import { baseSlugFor } from "@/lib/slug";

const scopeSchema = z.enum(["admin", "owner"]).default("owner");

function parseScope(formData: FormData): "admin" | "owner" {
  return scopeSchema.parse(formData.get("scope") ?? undefined);
}

const businessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name must be 120 characters or fewer."),
  googleReviewUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine(
      (v) => v === undefined || /^https:\/\//.test(v),
      "Must start with https://",
    ),
  googlePlaceId: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type BusinessFormState =
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

export async function createBusiness(
  _prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const scope = parseScope(formData);
  // Defense in depth: server actions bypass route-level layout gating.
  // createBusiness remains super-admin only — owners can UPDATE their own
  // business (migration 0005) but cannot INSERT a new one.
  if (scope === "admin") {
    await requireSuperAdmin();
  } else {
    await verifySession();
  }
  const base = "/" + (scope === "admin" ? "admin" : "dashboard");

  const parsed = businessSchema.safeParse({
    name: formData.get("name"),
    googleReviewUrl: formData.get("googleReviewUrl"),
    googlePlaceId: formData.get("googlePlaceId"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const { name, googleReviewUrl, googlePlaceId } = parsed.data;
  const baseSlug = baseSlugFor(name);
  const supabase = await createClient();

  for (let attempt = 0; attempt < MAX_SLUG_TRIES; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("businesses")
      .insert({
        name,
        slug: candidate,
        google_review_url: googleReviewUrl ?? null,
        google_place_id: googlePlaceId ?? null,
      })
      .select("id")
      .single();

    if (!error && data) {
      revalidatePath(base);
      redirect(`${base}/restaurants/${data.id}`);
    }

    // Slug uniqueness collision — retry with suffix.
    if (error && error.code === "23505") continue;

    if (error) {
      return { error: error.message };
    }
  }

  return { error: "Could not find an available slug. Try a different name." };
}

const updateSchema = businessSchema.extend({
  id: z.uuid("Invalid restaurant id."),
});

// Owner-scoped update is intentionally narrower than admin-scoped update.
// Field whitelist is enforced HERE in the server action (RLS only gates the
// row). Adding fields to this schema is the only correct way to expand
// owner-write capability — never spread an unvalidated form body into the
// UPDATE call below. Specifically: do NOT add slug, google_review_url, or
// google_place_id here; those are admin-controlled.
const ownerUpdateSchema = z.object({
  id: z.uuid("Invalid restaurant id."),
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name must be 120 characters or fewer."),
  phone: z
    .string()
    .trim()
    .max(40, "Phone must be 40 characters or fewer.")
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  address: z
    .string()
    .trim()
    .max(240, "Address must be 240 characters or fewer.")
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  hours: z
    .string()
    .trim()
    .max(240, "Hours must be 240 characters or fewer.")
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export async function updateBusiness(
  _prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const scope = parseScope(formData);
  const base = "/" + (scope === "admin" ? "admin" : "dashboard");

  if (scope === "admin") {
    await requireSuperAdmin();

    const parsed = updateSchema.safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      googleReviewUrl: formData.get("googleReviewUrl"),
      googlePlaceId: formData.get("googlePlaceId"),
    });
    if (!parsed.success) {
      return { fieldErrors: collectFieldErrors(parsed.error) };
    }

    const { id, name, googleReviewUrl, googlePlaceId } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("businesses")
      .update({
        name,
        google_review_url: googleReviewUrl ?? null,
        google_place_id: googlePlaceId ?? null,
      })
      .eq("id", id)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return { error: "You don't have access to that restaurant." };
    }

    revalidatePath(base);
    revalidatePath(`${base}/restaurants/${id}`);
    redirect(`${base}/restaurants/${id}`);
  }

  // Owner branch — narrow schema, narrow column whitelist.
  const businessIdCandidate = formData.get("id");
  if (typeof businessIdCandidate === "string") {
    await requireBusinessAccess(businessIdCandidate);
  } else {
    await verifySession();
  }

  const parsed = ownerUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    hours: formData.get("hours"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const { id, name, phone, address, hours } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("businesses")
    .update({ name, phone, address, hours })
    .eq("id", id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "You don't have access to that restaurant." };
  }

  revalidatePath(base);
  revalidatePath(`${base}/restaurants/${id}`);
  redirect(`${base}/restaurants/${id}`);
}
