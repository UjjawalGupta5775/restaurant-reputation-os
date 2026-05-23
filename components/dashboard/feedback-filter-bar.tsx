import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Period } from "@/lib/queries/period";

type Props = {
  businessId: string;
  currentRating: number | null;
  basePath?: string;
  period?: Period;
};

const RATINGS = [5, 4, 3, 2, 1] as const;

export function FeedbackFilterBar({
  businessId,
  currentRating,
  basePath = "/dashboard",
  period,
}: Props) {
  const base = `${basePath}/restaurants/${businessId}/feedback`;
  const periodSuffix = period && period !== "30d" ? `period=${period}` : "";

  const hrefFor = (rating: number | null): string => {
    const parts: string[] = [];
    if (rating !== null) parts.push(`rating=${rating}`);
    if (periodSuffix) parts.push(periodSuffix);
    const qs = parts.join("&");
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Filter feedback by rating"
    >
      <FilterChip href={hrefFor(null)} active={currentRating === null}>
        All
      </FilterChip>
      {RATINGS.map((r) => (
        <FilterChip
          key={r}
          href={hrefFor(r)}
          active={currentRating === r}
        >
          <span className="tabular-nums">{r}</span> ★
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input bg-background hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
