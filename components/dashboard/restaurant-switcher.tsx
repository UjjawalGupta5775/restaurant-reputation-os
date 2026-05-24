"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BusinessSummary } from "@/lib/queries/businesses";

type Props = {
  restaurants: BusinessSummary[];
  currentBusinessId: string;
};

// Context switcher for owners who have access to multiple businesses.
// One business: static label. Two or more: a native select that navigates
// on change. Native <select> matches the existing form aesthetic and avoids
// pulling in a portal-based dropdown primitive.
//
// Carries the current URL search params through on switch so settings like
// ?period=today survive the navigation — otherwise picking "Today" then
// switching businesses silently reverts to the 30-day default.
function RestaurantSwitcherInner({ restaurants, currentBusinessId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (restaurants.length === 1) {
    const only = restaurants[0];
    return (
      <p className="font-serif text-base text-muted-foreground">
        {only.name}
      </p>
    );
  }

  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Business
      </span>
      <select
        aria-label="Switch business"
        value={currentBusinessId}
        onChange={(e) => {
          const nextId = e.target.value;
          if (nextId && nextId !== currentBusinessId) {
            router.push(`/dashboard/restaurants/${nextId}${suffix}`);
          }
        }}
        className="flex h-9 min-w-48 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RestaurantSwitcher(props: Props) {
  if (props.restaurants.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <RestaurantSwitcherInner {...props} />
    </Suspense>
  );
}
