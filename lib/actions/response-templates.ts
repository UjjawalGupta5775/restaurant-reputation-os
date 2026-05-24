"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusinessAccess } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { checkOperationalSubscription } from "@/lib/billing/guard";

export type TemplateActionState =
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

// Mutations come from either /dashboard or /admin; both routes render
// the same manager from the same query, so both caches need to bust
// after every write. Otherwise the cross-role view is stale until next
// hard navigation.
function revalidateTemplatePaths(businessId: string) {
  revalidatePath(`/dashboard/restaurants/${businessId}/templates`);
  revalidatePath(`/dashboard/restaurants/${businessId}/feedback`);
  revalidatePath(`/admin/restaurants/${businessId}/templates`);
  revalidatePath(`/admin/restaurants/${businessId}/feedback`);
}

const createSchema = z.object({
  businessId: z.uuid(),
  label: z.string().trim().min(1, "Label is required.").max(80),
  body: z.string().trim().min(1, "Body is required.").max(1000),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

const updateSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  label: z.string().trim().min(1, "Label is required.").max(80),
  body: z.string().trim().min(1, "Body is required.").max(1000),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

const deleteSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
});

export async function createResponseTemplate(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const parsed = createSchema.safeParse({
    businessId: formData.get("businessId"),
    label: formData.get("label"),
    body: formData.get("body"),
    sortOrder: formData.get("sortOrder") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const role = await requireBusinessAccess(parsed.data.businessId);
  const billingError = await checkOperationalSubscription(
    parsed.data.businessId,
    role,
  );
  if (billingError) return { ok: false, error: billingError };

  const supabase = await createClient();
  const { error } = await supabase.from("response_templates").insert({
    business_id: parsed.data.businessId,
    label: parsed.data.label,
    body: parsed.data.body,
    sort_order: parsed.data.sortOrder ?? 0,
  });

  if (error) {
    return { ok: false, error: "Could not save the template." };
  }

  revalidateTemplatePaths(parsed.data.businessId);
  return { ok: true, message: "Template added." };
}

export async function updateResponseTemplate(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    businessId: formData.get("businessId"),
    label: formData.get("label"),
    body: formData.get("body"),
    sortOrder: formData.get("sortOrder") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const role = await requireBusinessAccess(parsed.data.businessId);
  const billingError = await checkOperationalSubscription(
    parsed.data.businessId,
    role,
  );
  if (billingError) return { ok: false, error: billingError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("response_templates")
    .update({
      label: parsed.data.label,
      body: parsed.data.body,
      sort_order: parsed.data.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    return { ok: false, error: "Could not update the template." };
  }

  revalidateTemplatePaths(parsed.data.businessId);
  return { ok: true, message: "Template updated." };
}

export async function deleteResponseTemplate(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const parsed = deleteSchema.safeParse({
    id: formData.get("id"),
    businessId: formData.get("businessId"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const role = await requireBusinessAccess(parsed.data.businessId);
  const billingError = await checkOperationalSubscription(
    parsed.data.businessId,
    role,
  );
  if (billingError) return { ok: false, error: billingError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("response_templates")
    .delete()
    .eq("id", parsed.data.id)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    return { ok: false, error: "Could not delete the template." };
  }

  revalidateTemplatePaths(parsed.data.businessId);
  return { ok: true, message: "Template deleted." };
}
