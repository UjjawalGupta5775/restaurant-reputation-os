import { cn } from "@/lib/utils";

type Props = {
  value: number;
  className?: string;
};

const STARS = [1, 2, 3, 4, 5];

export function RatingStars({ value, className }: Props) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span
      role="img"
      aria-label={`${clamped} of 5 stars`}
      className={cn("inline-flex items-center gap-0.5 text-base", className)}
    >
      {STARS.map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={cn(
            clamped >= n ? "text-amber-500" : "text-muted-foreground/50",
          )}
        >
          {clamped >= n ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
