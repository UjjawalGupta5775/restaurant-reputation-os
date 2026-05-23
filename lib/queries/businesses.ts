import "server-only";
import { createClient } from "@/lib/supabase/server";

export type BusinessSummary = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  campaignCount: number;
};

export async function listBusinessesForOwner(): Promise<BusinessSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, created_at, campaigns(count)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const campaignsField = row.campaigns as
      | Array<{ count: number }>
      | { count: number }
      | null;
    const campaignCount = Array.isArray(campaignsField)
      ? (campaignsField[0]?.count ?? 0)
      : (campaignsField?.count ?? 0);
    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      created_at: row.created_at as string,
      campaignCount,
    };
  });
}

export type OwnerBusiness = {
  id: string;
  name: string;
  slug: string;
  google_review_url: string | null;
  google_place_id: string | null;
  phone: string | null;
  address: string | null;
  hours: string | null;
  created_at: string;
};

export async function getBusinessByIdForOwner(
  id: string,
): Promise<OwnerBusiness | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, slug, google_review_url, google_place_id, phone, address, hours, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as OwnerBusiness | null) ?? null;
}

export type PublicBusiness = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  google_review_url: string | null;
};

export async function getBusinessBySlugPublic(
  slug: string,
): Promise<PublicBusiness | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, logo_url, google_review_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data as PublicBusiness | null) ?? null;
}
