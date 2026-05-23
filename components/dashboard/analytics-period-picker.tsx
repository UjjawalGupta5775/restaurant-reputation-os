"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PERIOD_OPTIONS, parsePeriod, type Period } from "@/lib/queries/period";
import { cn } from "@/lib/utils";

// URL-driven analytics window picker. Lives above the KPI strip on the
// restaurant detail page. `?period=today|yesterday|7d|30d` is the single
// source of truth — every KPI / funnel / chart query downstream reads it.

function PeriodPickerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active: Period = parsePeriod(searchParams.get("period"));

  const onSelect = (next: Period) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "30d") {
      params.delete("period");
    } else {
      params.set("period", next);
    }
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  };

  return (
    <div
      role="radiogroup"
      aria-label="Analytics window"
      className="inline-flex flex-wrap items-center gap-1 rounded-md border bg-card p-1"
    >
      {PERIOD_OPTIONS.map((opt) => {
        const isActive = opt.value === active;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(opt.value)}
            className={cn(
              "rounded px-3 py-1 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1",
              isActive
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function AnalyticsPeriodPicker() {
  return (
    <Suspense fallback={null}>
      <PeriodPickerInner />
    </Suspense>
  );
}
