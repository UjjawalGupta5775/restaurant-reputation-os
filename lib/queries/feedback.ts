import "server-only";
import { createClient } from "@/lib/supabase/server";

export type FeedbackRow = {
  id: string;
  rating: number;
  feedback_text: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  campaign: {
    id: string;
    name: string;
    slug: string;
    source_type: string;
  } | null;
};

export type ListFeedbackOptions = {
  rating?: number;
  page?: number;
  pageSize?: number;
};

export type FeedbackPage = {
  rows: FeedbackRow[];
  total: number;
  page: number;
  pageSize: number;
};

const DEFAULT_PAGE_SIZE = 50;

export async function listFeedbackForRestaurant(
  businessId: string,
  options: ListFeedbackOptions = {},
): Promise<FeedbackPage> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("feedback_submissions")
    .select(
      "id, rating, feedback_text, contact_name, contact_phone, created_at, campaign:campaigns(id, name, slug, source_type)",
      { count: "exact" },
    )
    .eq("business_id", businessId);

  if (
    typeof options.rating === "number" &&
    options.rating >= 1 &&
    options.rating <= 5
  ) {
    query = query.eq("rating", options.rating);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const rows: FeedbackRow[] = (data ?? []).map((row) => {
    const campaignField = (
      row as unknown as {
        campaign:
          | FeedbackRow["campaign"]
          | FeedbackRow["campaign"][]
          | null;
      }
    ).campaign;
    const campaign = Array.isArray(campaignField)
      ? (campaignField[0] ?? null)
      : campaignField;
    return {
      id: row.id as string,
      rating: row.rating as number,
      feedback_text: (row.feedback_text as string | null) ?? null,
      contact_name: (row.contact_name as string | null) ?? null,
      contact_phone: (row.contact_phone as string | null) ?? null,
      created_at: row.created_at as string,
      campaign,
    };
  });

  return {
    rows,
    total: count ?? 0,
    page,
    pageSize,
  };
}
