import type { RestaurantKpis } from "@/lib/queries/analytics";
import { KpiCard } from "./kpi-card";

type Props = {
  kpis: RestaurantKpis;
};

export function KpiStrip({ kpis }: Props) {
  const avg =
    kpis.thirtyDayAvgRating === null
      ? "—"
      : kpis.thirtyDayAvgRating.toFixed(1);

  return (
    <section
      aria-label="Key metrics"
      className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
    >
      <KpiCard
        label="Scans (30d)"
        value={kpis.thirtyDayScans.toLocaleString()}
        sub={`${kpis.allTimeScans.toLocaleString()} all-time`}
      />
      <KpiCard
        label="Ratings (30d)"
        value={kpis.thirtyDayRatings.toLocaleString()}
        sub={`${kpis.allTimeRatings.toLocaleString()} all-time`}
      />
      <KpiCard
        label="Avg ★ (30d)"
        value={avg}
        sub={
          kpis.thirtyDayRatings === 0
            ? "no ratings yet"
            : `over ${kpis.thirtyDayRatings.toLocaleString()} rating${
                kpis.thirtyDayRatings === 1 ? "" : "s"
              }`
        }
      />
      <KpiCard
        label="Google clicks (30d)"
        value={kpis.thirtyDayGoogleClicks.toLocaleString()}
        sub={
          kpis.thirtyDayRatings === 0
            ? undefined
            : `${Math.round(
                (kpis.thirtyDayGoogleClicks /
                  Math.max(1, kpis.thirtyDayRatings)) *
                  100,
              )}% of ratings`
        }
      />
      <KpiCard
        label="Feedback (30d)"
        value={kpis.thirtyDayFeedback.toLocaleString()}
        sub={`${kpis.allTimeFeedback.toLocaleString()} all-time`}
      />
    </section>
  );
}
