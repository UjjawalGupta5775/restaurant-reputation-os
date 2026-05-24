"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { AdminBusinessStatusFilter } from "@/lib/queries/businesses";
import { cn } from "@/lib/utils";

// Search + status-filter controls for the /admin home grid. Both update
// the URL (?q= and ?status=) so the page is fully shareable and the
// server component re-renders with the new filter. Period and page
// params are preserved across changes.
//
// The search input is intentionally uncontrolled (defaultValue + key on
// initialSearch). When the URL-driven initialSearch changes (e.g. after
// the "Clear" link is clicked), the key change remounts the input with
// the new default. This avoids the cascading-render pattern that
// useState + useEffect synchronization would create.

const STATUS_OPTIONS: Array<{
  value: AdminBusinessStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
  { value: "no_subscription", label: "No sub" },
];

export function AdminRestaurantListControls({
  initialSearch,
  currentStatus,
}: {
  initialSearch: string;
  currentStatus: AdminBusinessStatusFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const pushParams = useCallback(
    (mut: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mut(next);
      // Reset to page 1 on any filter or search change.
      next.delete("page");
      const queryString = next.toString();
      startTransition(() => {
        router.push(queryString ? `${pathname}?${queryString}` : pathname);
      });
    },
    [pathname, router, searchParams],
  );

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const value = String(data.get("q") ?? "").trim();
    pushParams((params) => {
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
    });
  };

  const onStatusClick = (status: AdminBusinessStatusFilter) => {
    pushParams((params) => {
      if (status === "all") {
        params.delete("status");
      } else {
        params.set("status", status);
      }
    });
  };

  const hasSearch = initialSearch.length > 0;
  const clearHref = (() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("q");
    next.delete("page");
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  })();

  return (
    <div className="space-y-3">
      <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
        <input
          key={initialSearch}
          type="search"
          name="q"
          placeholder="Search by name or slug…"
          defaultValue={initialSearch}
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <button
          type="submit"
          className="h-9 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent"
        >
          Search
        </button>
        {hasSearch && (
          <Link
            href={clearHref}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_OPTIONS.map((opt) => {
          const active = opt.value === currentStatus;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStatusClick(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
