import Link from "next/link";
import { cn } from "@/lib/utils";

// Pagination footer for /admin home. Server component — receives the
// current params and emits next/prev links that preserve the rest of the
// query string (q, status, period).

type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  baseSearchParams: Record<string, string | undefined>;
};

function buildHref(
  base: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined && v !== "") params.set(k, v);
  }
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/admin?${s}` : "/admin";
}

export function AdminRestaurantListPagination({
  page,
  totalPages,
  total,
  pageSize,
  baseSearchParams,
}: Props) {
  if (totalPages <= 1) {
    return (
      <p className="text-sm text-muted-foreground">
        Showing {total} {total === 1 ? "restaurant" : "restaurants"}.
      </p>
    );
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  const prevHref = page > 1 ? buildHref(baseSearchParams, page - 1) : null;
  const nextHref =
    page < totalPages ? buildHref(baseSearchParams, page + 1) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Showing <span className="tabular-nums">{start}</span>–
        <span className="tabular-nums">{end}</span> of{" "}
        <span className="tabular-nums">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link
            href={prevHref}
            className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
          >
            ← Previous
          </Link>
        ) : (
          <span
            className={cn(
              "rounded-md border px-3 py-1 text-sm",
              "text-muted-foreground/60",
            )}
            aria-disabled="true"
          >
            ← Previous
          </span>
        )}
        <span className="px-2 text-muted-foreground tabular-nums">
          Page {page} / {totalPages}
        </span>
        {nextHref ? (
          <Link
            href={nextHref}
            className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
          >
            Next →
          </Link>
        ) : (
          <span
            className={cn(
              "rounded-md border px-3 py-1 text-sm",
              "text-muted-foreground/60",
            )}
            aria-disabled="true"
          >
            Next →
          </span>
        )}
      </div>
    </div>
  );
}
