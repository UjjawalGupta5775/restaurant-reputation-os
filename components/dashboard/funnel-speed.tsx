import type { FunnelTiming } from "@/lib/queries/analytics";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  timing: FunnelTiming;
  periodLabel: string;
};

// Target completion time stated in CLAUDE.md. The card surfaces a
// pass/over indicator relative to this anchor so owners can see at a
// glance whether the funnel is meeting the design goal.
const TARGET_MS = 20_000;

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds - minutes * 60);
  return `${minutes}m ${rem}s`;
}

function verdict(ms: number | null): { label: string; tone: "good" | "over" | "none" } {
  if (ms === null) return { label: "no data yet", tone: "none" };
  if (ms <= TARGET_MS) return { label: "under 20s target", tone: "good" };
  return { label: "over 20s target", tone: "over" };
}

export function FunnelSpeed({ timing, periodLabel }: Props) {
  const rate = verdict(timing.medianTimeToRateMs);
  const complete = verdict(timing.medianTimeToCompleteMs);

  return (
    <section aria-label="Funnel speed" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-lg tracking-tight">Funnel speed</h3>
        <p className="text-xs text-muted-foreground">
          Median scan-to-action time · {periodLabel.toLowerCase()}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Scan → rating
            </p>
            <p className="font-serif text-3xl tabular-nums tracking-tight">
              {formatMs(timing.medianTimeToRateMs)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {timing.rateSampleCount === 0
                ? "no ratings yet"
                : `${rate.label} · over ${timing.rateSampleCount.toLocaleString()} rating${
                    timing.rateSampleCount === 1 ? "" : "s"
                  }`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Scan → completion
            </p>
            <p className="font-serif text-3xl tabular-nums tracking-tight">
              {formatMs(timing.medianTimeToCompleteMs)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {timing.completeSampleCount === 0
                ? "no completions yet"
                : `${complete.label} · over ${timing.completeSampleCount.toLocaleString()} completion${
                    timing.completeSampleCount === 1 ? "" : "s"
                  }`}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
