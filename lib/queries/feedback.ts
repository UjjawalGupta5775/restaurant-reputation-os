import "server-only";
import { createClient } from "@/lib/supabase/server";
import { periodRange, type Period } from "@/lib/queries/period";

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
  period?: Period;
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

  if (options.period) {
    const { fromIso, toIso } = periodRange(options.period);
    query = query.gte("created_at", fromIso).lt("created_at", toIso);
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

// Platform-wide variant for /admin/feedback. Same shape plus a `business`
// pointer so the cross-tenant view can show which business each row
// belongs to. RLS already gates: feedback_submissions is super-admin
// only by policy, so a non-admin call returns an empty page.
export type AdminFeedbackRow = FeedbackRow & {
  business: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type AdminFeedbackPage = {
  rows: AdminFeedbackRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listAllFeedback(
  options: ListFeedbackOptions = {},
): Promise<AdminFeedbackPage> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("feedback_submissions")
    .select(
      "id, rating, feedback_text, contact_name, contact_phone, created_at, campaign:campaigns(id, name, slug, source_type), business:businesses(id, name, slug)",
      { count: "exact" },
    );

  if (
    typeof options.rating === "number" &&
    options.rating >= 1 &&
    options.rating <= 5
  ) {
    query = query.eq("rating", options.rating);
  }

  if (options.period) {
    const { fromIso, toIso } = periodRange(options.period);
    query = query.gte("created_at", fromIso).lt("created_at", toIso);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const rows: AdminFeedbackRow[] = (data ?? []).map((row) => {
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
    const businessField = (
      row as unknown as {
        business:
          | AdminFeedbackRow["business"]
          | AdminFeedbackRow["business"][]
          | null;
      }
    ).business;
    const business = Array.isArray(businessField)
      ? (businessField[0] ?? null)
      : businessField;
    return {
      id: row.id as string,
      rating: row.rating as number,
      feedback_text: (row.feedback_text as string | null) ?? null,
      contact_name: (row.contact_name as string | null) ?? null,
      contact_phone: (row.contact_phone as string | null) ?? null,
      created_at: row.created_at as string,
      campaign,
      business,
    };
  });

  return {
    rows,
    total: count ?? 0,
    page,
    pageSize,
  };
}
