import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySession } from "@/lib/dal";
import {
  evaluateAccess,
  type AccessReason,
  type SubscriptionStatus,
} from "@/lib/billing/state";

export type BusinessSummary = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  campaignCount: number;
};

// listBusinessesForOwner — returns ONLY the businesses the current user
// is a member of. Defense-in-depth: RLS already filters by membership +
// super-admin, but a super-admin signed in to /dashboard would otherwise
// see every business on the platform. We want the owner-facing list to
// stay scoped even when an admin happens to be looking at it. Admins
// reach the full list via /admin (listAllBusinesses).
export async function listBusinessesForOwner(): Promise<BusinessSummary[]> {
  const session = await verifySession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, slug, created_at, campaigns(count), business_members!inner(user_id)",
    )
    .eq("business_members.user_id", session.userId)
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

// listAllBusinesses — admin-only. Returns every business on the platform.
// RLS still gates this (super-admins pass has_business_access), so a
// non-admin calling it gets an empty list. The caller is expected to
// have already gated via requireSuperAdmin.
export async function listAllBusinesses(): Promise<BusinessSummary[]> {
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

// AdminBusinessRow — what the paginated /admin home grid renders.
// Carries subscription state for the status badge + filter logic.
export type AdminBusinessRow = BusinessSummary & {
  subscriptionStatus: SubscriptionStatus | null; // null = no row at all
  accessReason: AccessReason;
  hasAccess: boolean;
};

export type AdminBusinessStatusFilter =
  | "all"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "no_subscription";

export type AdminBusinessListOptions = {
  search?: string;
  status?: AdminBusinessStatusFilter;
  page?: number;
  pageSize?: number;
};

export type AdminBusinessPage = {
  rows: AdminBusinessRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_ADMIN_PAGE_SIZE = 24;

// listAllBusinessesAdmin — paginated, searchable, status-filterable view
// of every business for the super-admin home. Uses the service-role
// client so it can do the cross-table read against subscriptions in one
// shot (subscriptions has no anon/owner write paths and an admin
// short-circuit on select, so the service role is fine here — caller
// must still gate via requireSuperAdmin before invoking).
//
// Filtering strategy:
//   - Search (name ILIKE) runs in SQL — cheap and selective.
//   - Status filter and pagination apply IN MEMORY after evaluateAccess
//     runs on each row. Reason: the access machinery walks several
//     time-based fields whose AND-of-conditions doesn't translate
//     cleanly to PostgREST filter syntax, and we want the displayed
//     badge to always agree with the filter. Current platform size
//     (low hundreds of businesses) makes the full scan trivial; if the
//     list grows past a few thousand, push the filter into a SQL
//     function with the same evaluator logic baked in.
export async function listAllBusinessesAdmin(
  options: AdminBusinessListOptions = {},
): Promise<AdminBusinessPage> {
  const {
    search = "",
    status = "all",
    page = 1,
    pageSize = DEFAULT_ADMIN_PAGE_SIZE,
  } = options;

  const trimmedSearch = search.trim();

  let query = supabaseAdmin
    .from("businesses")
    .select(
      "id, name, slug, created_at, campaigns(count), subscriptions(id, business_id, provider, provider_customer_id, provider_subscription_id, status, trial_ends_at, current_period_ends_at, grace_until, admin_override_until, cancel_at, canceled_at, metadata, created_at, updated_at)",
    )
    .order("created_at", { ascending: false });

  if (trimmedSearch) {
    // Escape % and _ that users might paste — those would become wildcards
    // and produce surprising matches.
    const safe = trimmedSearch.replace(/[\\%_]/g, (c) => `\\${c}`);
    query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: AdminBusinessRow[] = (data ?? []).map((row) => {
    const campaignsField = row.campaigns as
      | Array<{ count: number }>
      | { count: number }
      | null;
    const campaignCount = Array.isArray(campaignsField)
      ? (campaignsField[0]?.count ?? 0)
      : (campaignsField?.count ?? 0);

    const subsField = row.subscriptions as
      | Array<Record<string, unknown>>
      | Record<string, unknown>
      | null;
    const subRow = Array.isArray(subsField)
      ? (subsField[0] ?? null)
      : (subsField ?? null);

    const sub = subRow
      ? {
          id: subRow.id as string,
          businessId: subRow.business_id as string,
          provider: subRow.provider as string,
          providerCustomerId: (subRow.provider_customer_id as string | null) ?? null,
          providerSubscriptionId:
            (subRow.provider_subscription_id as string | null) ?? null,
          status: subRow.status as SubscriptionStatus,
          trialEndsAt: (subRow.trial_ends_at as string | null) ?? null,
          currentPeriodEndsAt:
            (subRow.current_period_ends_at as string | null) ?? null,
          graceUntil: (subRow.grace_until as string | null) ?? null,
          adminOverrideUntil:
            (subRow.admin_override_until as string | null) ?? null,
          cancelAt: (subRow.cancel_at as string | null) ?? null,
          canceledAt: (subRow.canceled_at as string | null) ?? null,
          metadata: (subRow.metadata as Record<string, unknown>) ?? {},
          createdAt: subRow.created_at as string,
          updatedAt: subRow.updated_at as string,
        }
      : null;

    const verdict = evaluateAccess(sub);

    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      created_at: row.created_at as string,
      campaignCount,
      subscriptionStatus: sub?.status ?? null,
      accessReason: verdict.reason,
      hasAccess: verdict.ok,
    };
  });

  const filtered = rows.filter((r) => {
    if (status === "all") return true;
    if (status === "no_subscription") {
      return r.subscriptionStatus === null;
    }
    return r.subscriptionStatus === status;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;
  const sliced = filtered.slice(start, start + pageSize);

  return {
    rows: sliced,
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
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
  logo_url: string | null;
  created_at: string;
};

export async function getBusinessByIdForOwner(
  id: string,
): Promise<OwnerBusiness | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, slug, google_review_url, google_place_id, phone, address, hours, logo_url, created_at",
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
