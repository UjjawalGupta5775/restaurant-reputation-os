import Link from "next/link";
import { requireSuperAdmin } from "@/lib/dal";
import { listAllFeedback } from "@/lib/queries/feedback";
import { parsePeriod, periodLabel, type Period } from "@/lib/queries/period";
import { RatingStars } from "@/components/dashboard/rating-stars";
import { AnalyticsPeriodPicker } from "@/components/dashboard/analytics-period-picker";
import { absoluteTime, relativeTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RATINGS = [5, 4, 3, 2, 1] as const;

function parseRating(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

// Build /admin/feedback URLs preserving rating + period + page state. The
// owner-side FeedbackFilterBar/FeedbackPagination are hard-coded to the
// /restaurants/[id]/feedback path, so we re-implement those controls
// inline rather than refactoring shared components.
function adminFeedbackHref(opts: {
  rating?: number | null;
  period?: Period;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.rating) params.set("rating", String(opts.rating));
  if (opts.period && opts.period !== "30d") params.set("period", opts.period);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `/admin/feedback?${qs}` : "/admin/feedback";
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ rating?: string; page?: string; period?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const rating = parseRating(sp.rating);
  const page = parsePage(sp.page);
  const period = parsePeriod(sp.period);

  const result = await listAllFeedback({
    rating: rating ?? undefined,
    page,
    period,
  });

  const filtered = rating !== null;
  const windowed = period !== "30d";
  const windowLabel = periodLabel(period).toLowerCase();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const prevHref =
    result.page > 1
      ? adminFeedbackHref({ rating, period, page: result.page - 1 })
      : null;
  const nextHref =
    result.page < totalPages
      ? adminFeedbackHref({ rating, period, page: result.page + 1 })
      : null;

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/admin"
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to admin
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">
          Platform feedback
        </h1>
        <p className="tabular-nums text-sm text-muted-foreground">
          {result.total === 0
            ? filtered || windowed
              ? "No submissions match this filter."
              : "No submissions yet."
            : `${result.total.toLocaleString()} submission${
                result.total === 1 ? "" : "s"
              }${filtered ? ` rated ${rating} ★` : ""}${
                windowed ? ` · ${windowLabel}` : ""
              } across all restaurants.`}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter feedback by rating"
        >
          <FilterChip
            href={adminFeedbackHref({ rating: null, period })}
            active={rating === null}
          >
            All
          </FilterChip>
          {RATINGS.map((r) => (
            <FilterChip
              key={r}
              href={adminFeedbackHref({ rating: r, period })}
              active={rating === r}
            >
              <span className="tabular-nums">{r}</span> ★
            </FilterChip>
          ))}
        </div>
        <AnalyticsPeriodPicker />
      </div>

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-serif italic text-base text-muted-foreground max-w-md mx-auto">
              {filtered ? (
                <>
                  No customers submitted feedback at {rating} ★
                  {windowed ? ` ${windowLabel}` : " yet"} across any
                  restaurant. Try a different filter or view{" "}
                  <Link
                    href={adminFeedbackHref({ rating: null, period })}
                    className="underline"
                  >
                    All
                  </Link>
                  .
                </>
              ) : windowed ? (
                <>
                  No submissions {windowLabel}. Try a wider window or view{" "}
                  <Link href="/admin/feedback" className="underline">
                    last 30 days
                  </Link>
                  .
                </>
              ) : (
                <>
                  As soon as a customer on any restaurant&apos;s funnel sends
                  private feedback, it will appear here.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {result.rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <RatingStars value={row.rating} />
                      <time
                        dateTime={row.created_at}
                        title={absoluteTime(row.created_at)}
                        className="tabular-nums text-xs text-muted-foreground"
                      >
                        {relativeTime(row.created_at)}
                      </time>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {row.business ? (
                        <Link
                          href={`/admin/restaurants/${row.business.id}/feedback`}
                          className="rounded-sm text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
                        >
                          {row.business.name}
                        </Link>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">
                          orphaned (business deleted)
                        </span>
                      )}
                      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {row.campaign
                          ? `${row.campaign.name} · ${row.campaign.source_type}`
                          : "no campaign"}
                      </p>
                    </div>
                  </div>

                  {row.feedback_text ? (
                    <blockquote className="border-l-2 border-muted-foreground/30 pl-3 font-serif italic text-base leading-relaxed">
                      {row.feedback_text}
                    </blockquote>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No written comment.
                    </p>
                  )}

                  {(row.contact_name || row.contact_phone) && (
                    <dl className="grid gap-y-2 gap-x-4 text-sm sm:grid-cols-2">
                      {row.contact_name && (
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Name:</dt>
                          <dd>{row.contact_name}</dd>
                        </div>
                      )}
                      {row.contact_phone && (
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Phone:</dt>
                          <dd>
                            <a
                              href={`tel:${row.contact_phone}`}
                              className="rounded-sm tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
                            >
                              {row.contact_phone}
                            </a>
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="tabular-nums text-muted-foreground">
            Page {result.page} of {totalPages} ·{" "}
            {result.total.toLocaleString()} submission
            {result.total === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            {prevHref ? (
              <Link
                href={prevHref}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                ← Prev
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "pointer-events-none opacity-50",
                )}
              >
                ← Prev
              </span>
            )}
            {nextHref ? (
              <Link
                href={nextHref}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Next →
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "pointer-events-none opacity-50",
                )}
              >
                Next →
              </span>
            )}
          </div>
        </div>
      )}
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
