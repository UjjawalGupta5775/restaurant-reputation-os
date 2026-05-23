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
import { recordAudit } from "@/lib/audit";

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
  // createBusiness remains super-admin only — owners use createOwnBusiness
  // (below), which routes through the create_owner_business RPC so the
  // membership row is inserted atomically with the business.
  let actorUserId: string;
  if (scope === "admin") {
    const session = await requireSuperAdmin();
    actorUserId = session.userId;
  } else {
    const session = await verifySession();
    actorUserId = session.userId;
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
      await recordAudit({
        actorUserId,
        businessId: data.id as string,
        action: "business_created",
        targetType: "business",
        targetId: data.id as string,
        metadata: { name, slug: candidate, scope },
      });
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

// Owner self-serve: create the caller's first restaurant via the
// create_owner_business RPC (security definer). The RPC inserts the
// business, the business_members row, and ensures the app_users row in
// one transaction. Used by /auth/signup (confirm-email path lands here)
// and by the empty-state form on /dashboard.
const ownCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name must be 120 characters or fewer."),
});

export async function createOwnBusiness(
  _prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const session = await verifySession();

  const parsed = ownCreateSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const slugBase = baseSlugFor(parsed.data.name);
  const { data: businessId, error } = await supabase.rpc(
    "create_owner_business",
    { p_name: parsed.data.name, p_slug_base: slugBase },
  );

  if (error || !businessId) {
    if (error?.message?.includes("slug_exhausted")) {
      return {
        error: "Too many restaurants with similar names. Try a more distinctive one.",
      };
    }
    return { error: "Could not create your restaurant. Please try again." };
  }

  await recordAudit({
    actorUserId: session.userId,
    businessId: businessId as string,
    action: "business_created",
    targetType: "business",
    targetId: businessId as string,
    metadata: { name: parsed.data.name, scope: "owner_self_serve" },
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard/restaurants/${businessId}`);
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
    const session = await requireSuperAdmin();

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

    await recordAudit({
      actorUserId: session.userId,
      businessId: id,
      action: "business_updated",
      targetType: "business",
      targetId: id,
      metadata: {
        scope: "admin",
        fields: ["name", "google_review_url", "google_place_id"],
      },
    });

    revalidatePath(base);
    revalidatePath(`${base}/restaurants/${id}`);
    redirect(`${base}/restaurants/${id}`);
  }

  // Owner branch — narrow schema, narrow column whitelist.
  const businessIdCandidate = formData.get("id");
  let actorUserId: string;
  if (typeof businessIdCandidate === "string") {
    const session = await requireBusinessAccess(businessIdCandidate);
    actorUserId = session.userId;
  } else {
    const session = await verifySession();
    actorUserId = session.userId;
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

  await recordAudit({
    actorUserId,
    businessId: id,
    action: "business_updated",
    targetType: "business",
    targetId: id,
    metadata: { scope: "owner", fields: ["name", "phone", "address", "hours"] },
  });

  revalidatePath(base);
  revalidatePath(`${base}/restaurants/${id}`);
  redirect(`${base}/restaurants/${id}`);
}

// --- Logo upload -----------------------------------------------------------
//
// Logos live in the public Supabase Storage bucket "restaurant-logos" at
// path `{business_id}/logo` (no extension — Content-Type is set from
// File.type at upload). Owner-scoped RLS on storage.objects gates writes
// (migration 0006). businesses.logo_url stores the public URL with a
// cache-busting ?v=<ts> query so updates don't get pinned to the previous
// image.

const LOGO_BUCKET = "restaurant-logos";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type LogoFormState =
  | {
      error?: string;
      ok?: boolean;
    }
  | undefined;

export async function updateBusinessLogo(
  _prev: LogoFormState,
  formData: FormData,
): Promise<LogoFormState> {
  const idRaw = formData.get("id");
  if (typeof idRaw !== "string" || !z.uuid().safeParse(idRaw).success) {
    return { error: "Invalid restaurant id." };
  }
  const session = await requireBusinessAccess(idRaw);

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!LOGO_ALLOWED_TYPES.has(file.type)) {
    return { error: "Logo must be a PNG, JPEG, or WebP image." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: "Logo must be 2 MB or smaller." };
  }

  const supabase = await createClient();
  const path = `${idRaw}/logo`;

  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  const cacheBustedUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { data, error: updateError } = await supabase
    .from("businesses")
    .update({ logo_url: cacheBustedUrl })
    .eq("id", idRaw)
    .select("id");
  if (updateError) return { error: updateError.message };
  if (!data || data.length === 0) {
    return { error: "You don't have access to that restaurant." };
  }

  await recordAudit({
    actorUserId: session.userId,
    businessId: idRaw,
    action: "business_logo_updated",
    targetType: "business",
    targetId: idRaw,
    metadata: {
      content_type: file.type,
      size_bytes: file.size,
    },
  });

  revalidatePath(`/dashboard/restaurants/${idRaw}`);
  revalidatePath(`/dashboard/restaurants/${idRaw}/edit`);
  return { ok: true };
}

export async function clearBusinessLogo(
  _prev: LogoFormState,
  formData: FormData,
): Promise<LogoFormState> {
  const idRaw = formData.get("id");
  if (typeof idRaw !== "string" || !z.uuid().safeParse(idRaw).success) {
    return { error: "Invalid restaurant id." };
  }
  const session = await requireBusinessAccess(idRaw);

  const supabase = await createClient();
  const path = `${idRaw}/logo`;

  // Best-effort removal of the object — if it's already gone, ignore.
  await supabase.storage.from(LOGO_BUCKET).remove([path]);

  const { data, error } = await supabase
    .from("businesses")
    .update({ logo_url: null })
    .eq("id", idRaw)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "You don't have access to that restaurant." };
  }

  await recordAudit({
    actorUserId: session.userId,
    businessId: idRaw,
    action: "business_logo_cleared",
    targetType: "business",
    targetId: idRaw,
  });

  revalidatePath(`/dashboard/restaurants/${idRaw}`);
  revalidatePath(`/dashboard/restaurants/${idRaw}/edit`);
  return { ok: true };
}
