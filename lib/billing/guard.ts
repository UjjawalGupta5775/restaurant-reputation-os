import "server-only";

import { hasOperationalAccess } from "@/lib/billing/state";
import { getSubscriptionForBusiness } from "@/lib/queries/subscriptions";

// Canonical user-facing error string for owner-side gates. Centralising
// keeps the copy consistent across chip / template / campaign mutations,
// and the wording is deliberately neutral — payment failures, lapsed
// trials, and canceled subs all land here and the owner-facing billing
// page disambiguates with the precise reason.
export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "This restaurant's subscription isn't active. Open Billing to start or restore a plan before making changes.";

// Returns null when the actor may proceed (super-admins always may,
// owners only when evaluateAccess(sub).ok is true). Returns the canonical
// error string when the gate is closed. Callers wrap into their own
// action state shape (ChipActionState, TemplateActionState, ...).
//
// Super-admin bypass is here for the same reason it's in createCampaign:
// support sometimes needs to fix a lapsed owner's data (re-order chips,
// edit a typo'd template) BEFORE the owner restarts billing.
export async function checkOperationalSubscription(
  businessId: string,
  role: { isSuperAdmin: boolean },
): Promise<string | null> {
  if (role.isSuperAdmin) return null;
  const sub = await getSubscriptionForBusiness(businessId);
  if (hasOperationalAccess(sub)) return null;
  return SUBSCRIPTION_REQUIRED_MESSAGE;
}
