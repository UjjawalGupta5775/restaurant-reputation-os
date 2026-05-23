import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/dal";

export type AuditEntry = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  businessId: string | null;
  businessName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// listRecentAudit: super-admin view of the most recent audit entries.
// Joins actor email and business name in memory (small page sizes — the
// admin surface caps at 200). Service role is used so the query bypasses
// the table's RLS read policies; we still gate the function via
// requireSuperAdmin so callers prove they're an admin first.
export async function listRecentAudit(limit = 100): Promise<AuditEntry[]> {
  await requireSuperAdmin();

  const safeLimit = Math.min(Math.max(1, limit), 200);

  const { data: rows, error } = await supabaseAdmin
    .from("audit_log")
    .select(
      "id, actor_user_id, business_id, action, target_type, target_id, metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error || !rows) return [];

  const userIds = new Set<string>();
  const businessIds = new Set<string>();
  for (const r of rows) {
    if (r.actor_user_id) userIds.add(r.actor_user_id as string);
    if (r.business_id) businessIds.add(r.business_id as string);
  }

  const emailByUserId = new Map<string, string | null>();
  if (userIds.size > 0) {
    // listUsers caps at 200 — fine for the audit window we render.
    const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersPage) {
      for (const u of usersPage.users) {
        if (userIds.has(u.id)) emailByUserId.set(u.id, u.email ?? null);
      }
    }
  }

  const nameByBusinessId = new Map<string, string>();
  if (businessIds.size > 0) {
    const { data: bizRows } = await supabaseAdmin
      .from("businesses")
      .select("id, name")
      .in("id", Array.from(businessIds));
    if (bizRows) {
      for (const b of bizRows) {
        nameByBusinessId.set(b.id as string, b.name as string);
      }
    }
  }

  return rows.map((r) => ({
    id: r.id as string,
    actorUserId: (r.actor_user_id as string | null) ?? null,
    actorEmail: r.actor_user_id
      ? emailByUserId.get(r.actor_user_id as string) ?? null
      : null,
    businessId: (r.business_id as string | null) ?? null,
    businessName: r.business_id
      ? nameByBusinessId.get(r.business_id as string) ?? null
      : null,
    action: r.action as string,
    targetType: (r.target_type as string | null) ?? null,
    targetId: (r.target_id as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? {},
    createdAt: r.created_at as string,
  }));
}
