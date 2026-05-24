import { openCustomerPortal, startCheckout } from "@/lib/actions/billing";
import type { BillingBanner as BannerDescriptor } from "@/lib/billing/state";
import { Button } from "@/components/ui/button";

type Props = {
  banner: BannerDescriptor;
  businessId: string;
  returnPath: string;
};

const toneBar: Record<BannerDescriptor["tone"], string> = {
  info: "border-l-foreground/30",
  warn: "border-l-amber-500",
  critical: "border-l-red-500",
};

const ctaLabel: Record<NonNullable<BannerDescriptor["cta"]>, string> = {
  start_checkout: "Subscribe now",
  update_payment: "Update payment",
  manage_billing: "Manage billing",
};

// V1 banner-only billing surface. Renders the BannerDescriptor produced
// by deriveBanner(), with a single CTA wired to the right server action.
// Form-submit rather than a button-with-onClick so this stays a server
// component and progressively enhances — works even with JS off.
export function BillingBanner({ banner, businessId, returnPath }: Props) {
  const portalCta =
    banner.cta === "manage_billing" || banner.cta === "update_payment";
  const action = portalCta
    ? openCustomerPortal.bind(null, businessId, returnPath)
    : startCheckout.bind(null, businessId, returnPath);

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border border-l-2 bg-card px-4 py-3 ${toneBar[banner.tone]}`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{banner.headline}</p>
        {banner.body && (
          <p className="text-sm text-muted-foreground">{banner.body}</p>
        )}
      </div>
      {banner.cta && (
        <form action={action}>
          <Button type="submit" size="sm">
            {ctaLabel[banner.cta]}
          </Button>
        </form>
      )}
    </div>
  );
}
