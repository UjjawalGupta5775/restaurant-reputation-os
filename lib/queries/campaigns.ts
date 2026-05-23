import "server-only";
import { createClient } from "@/lib/supabase/server";

export type OwnerCampaign = {
  id: string;
  business_id: string;
  name: string;
  slug: string;
  source_type: string;
  table_code: string | null;
  staff_code: string | null;
  is_active: boolean;
  created_at: string;
};

export async function listCampaignsForBusiness(
  businessId: string,
): Promise<OwnerCampaign[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, business_id, name, slug, source_type, table_code, staff_code, is_active, created_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as OwnerCampaign[];
}

export type CampaignWithBusiness = OwnerCampaign & {
  business: {
    id: string;
    name: string;
    slug: string;
  };
};

export async function getCampaignWithBusinessForOwner(
  campaignId: string,
): Promise<CampaignWithBusiness | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, business_id, name, slug, source_type, table_code, staff_code, is_active, created_at, business:businesses(id, name, slug)",
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const businessField = (
    data as unknown as { business: CampaignWithBusiness["business"] | CampaignWithBusiness["business"][] }
  ).business;
  const business = Array.isArray(businessField)
    ? businessField[0]
    : businessField;
  if (!business) return null;

  return { ...(data as unknown as OwnerCampaign), business };
}

export type PublicCampaign = {
  id: string;
  slug: string;
  source_type: string;
  is_active: boolean;
};

export async function getActiveCampaignBySlugPublic(
  businessId: string,
  campaignSlug: string,
): Promise<PublicCampaign | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, slug, source_type, is_active")
    .eq("business_id", businessId)
    .eq("slug", campaignSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return (data as PublicCampaign | null) ?? null;
}
