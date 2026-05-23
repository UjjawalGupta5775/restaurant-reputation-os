import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Period } from "@/lib/queries/period";

type Props = {
  businessId: string;
  page: number;
  pageSize: number;
  total: number;
  rating: number | null;
  basePath?: string;
  period?: Period;
};

export function FeedbackPagination({
  businessId,
  page,
  pageSize,
  total,
  rating,
  basePath = "/dashboard",
  period,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const base = `${basePath}/restaurants/${businessId}/feedback`;
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (rating) params.set("rating", String(rating));
    if (period && period !== "30d") params.set("period", period);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const prevHref = page > 1 ? hrefFor(page - 1) : null;
  const nextHref = page < totalPages ? hrefFor(page + 1) : null;

  const linkClass = buttonVariants({ variant: "outline", size: "sm" });
  const disabledClass = cn(linkClass, "pointer-events-none opacity-50");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="tabular-nums text-muted-foreground">
        Page {page} of {totalPages} · {total.toLocaleString()} submission
        {total === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        {prevHref ? (
          <Link href={prevHref} className={linkClass}>
            ← Prev
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            ← Prev
          </span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={linkClass}>
            Next →
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            Next →
          </span>
        )}
      </div>
    </div>
  );
}
