import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import {
  getBusinessByIdForOwner,
  listBusinessesForOwner,
} from "@/lib/queries/businesses";
import { listFeedbackForRestaurant } from "@/lib/queries/feedback";
import { RatingStars } from "@/components/dashboard/rating-stars";
import { FeedbackFilterBar } from "@/components/dashboard/feedback-filter-bar";
import { FeedbackPagination } from "@/components/dashboard/feedback-pagination";
import { RestaurantSwitcher } from "@/components/dashboard/restaurant-switcher";
import { absoluteTime, relativeTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";

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

export default async function RestaurantFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rating?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rating = parseRating(sp.rating);
  const page = parsePage(sp.page);

  await requireBusinessAccess(id);

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const [result, restaurants] = await Promise.all([
    listFeedbackForRestaurant(id, {
      rating: rating ?? undefined,
      page,
    }),
    listBusinessesForOwner(),
  ]);

  const filtered = rating !== null;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/dashboard/restaurants/${business.id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to {business.name}
        </Link>
        <RestaurantSwitcher
          restaurants={restaurants}
          currentBusinessId={business.id}
        />
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Feedback</h1>
        <p className="tabular-nums text-sm text-muted-foreground">
          {result.total === 0
            ? filtered
              ? "No submissions match this filter."
              : "No submissions yet."
            : `${result.total.toLocaleString()} submission${
                result.total === 1 ? "" : "s"
              }${filtered ? ` rated ${rating} ★` : ""}.`}
        </p>
      </header>

      <FeedbackFilterBar businessId={business.id} currentRating={rating} />

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-serif italic text-base text-muted-foreground max-w-md mx-auto">
              {filtered ? (
                <>
                  No customers submitted feedback at {rating} ★ yet. Try a
                  different filter or view{" "}
                  <Link
                    href={`/dashboard/restaurants/${business.id}/feedback`}
                    className="underline"
                  >
                    All
                  </Link>
                  .
                </>
              ) : (
                <>
                  When customers complete the rating flow at{" "}
                  <span className="font-mono not-italic">
                    /r/{business.slug}
                  </span>
                  , their submissions will appear here.
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
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {row.campaign
                        ? `${row.campaign.name} · ${row.campaign.source_type}`
                        : "no campaign"}
                    </p>
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

      <FeedbackPagination
        businessId={business.id}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        rating={rating}
      />
    </div>
  );
}
