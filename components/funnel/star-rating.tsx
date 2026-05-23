"use client";

import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
};

const STARS = [1, 2, 3, 4, 5];

export function StarRating({ value, onChange, disabled }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Rate your experience from 1 to 5 stars"
      className="flex items-center justify-center gap-2"
    >
      {STARS.map((n) => {
        const filled = value >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full text-3xl transition-transform",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              "active:scale-95 disabled:opacity-60",
              filled ? "text-amber-500" : "text-muted-foreground/60",
            )}
          >
            <span aria-hidden="true">{filled ? "★" : "☆"}</span>
          </button>
        );
      })}
    </div>
  );
}
