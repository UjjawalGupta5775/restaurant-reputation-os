import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ResponseTemplate = {
  id: string;
  businessId: string;
  label: string;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export async function listResponseTemplatesForBusiness(
  businessId: string,
): Promise<ResponseTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("response_templates")
    .select("id, business_id, label, body, sort_order, created_at, updated_at")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    businessId: row.business_id as string,
    label: row.label as string,
    body: row.body as string,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}
