import type { RestaurantKpis } from "@/lib/queries/analytics";
import { KpiCard } from "./kpi-card";

type Props = {
  kpis: RestaurantKpis;
  periodLabel: string;
};

export function KpiStrip({ kpis, periodLabel }: Props) {
  const avg =
    kpis.windowAvgRating === null ? "—" : kpis.windowAvgRating.toFixed(1);

  return (
    <section
      aria-label="Key metrics"
      className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
    >
      <KpiCard
        label={`Scans · ${periodLabel}`}
        value={kpis.windowScans.toLocaleString()}
        sub={`${kpis.allTimeScans.toLocaleString()} all-time`}
      />
      <KpiCard
        label={`Ratings · ${periodLabel}`}
        value={kpis.windowRatings.toLocaleString()}
        sub={`${kpis.allTimeRatings.toLocaleString()} all-time`}
      />
      <KpiCard
        label={`Avg ★ · ${periodLabel}`}
        value={avg}
        sub={
          kpis.windowRatings === 0
            ? "no ratings yet"
            : `over ${kpis.windowRatings.toLocaleString()} rating${
                kpis.windowRatings === 1 ? "" : "s"
              }`
        }
      />
      <KpiCard
        label={`Google clicks · ${periodLabel}`}
        value={kpis.windowGoogleClicks.toLocaleString()}
        sub={
          kpis.windowRatings === 0
            ? undefined
            : `${Math.round(
                (kpis.windowGoogleClicks /
                  Math.max(1, kpis.windowRatings)) *
                  100,
              )}% of ratings`
        }
      />
      <KpiCard
        label={`Feedback · ${periodLabel}`}
        value={kpis.windowFeedback.toLocaleString()}
        sub={`${kpis.allTimeFeedback.toLocaleString()} all-time`}
      />
    </section>
  );
}
