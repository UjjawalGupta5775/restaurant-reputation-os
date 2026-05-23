import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  scans: number;
  ratings: number;
  googleClicks: number;
  feedback: number;
  periodLabel: string;
};

function pct(n: number, d: number): string {
  if (d <= 0) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function widthOf(n: number, max: number): string {
  if (max <= 0 || n <= 0) return "0%";
  const w = (n / max) * 100;
  return `${Math.min(100, Math.max(2, w))}%`;
}

export function FunnelBars({
  scans,
  ratings,
  googleClicks,
  feedback,
  periodLabel,
}: Props) {
  if (scans === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">{`Funnel · ${periodLabel}`}</CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center">
          <p className="font-serif italic text-base text-muted-foreground max-w-sm mx-auto">
            No scans in this window. Print a campaign QR and place it where
            customers can see it — activity will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">{`Funnel · ${periodLabel}`}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Customers fork at the dual-path screen — Google clicks and Feedback
          are parallel paths, not sequential steps.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <FunnelRow
          label="Scans"
          rightLabel={`${scans.toLocaleString()}`}
          width="100%"
        />
        <FunnelRow
          label="Ratings"
          rightLabel={`${ratings.toLocaleString()} · ${pct(ratings, scans)} of scans`}
          width={widthOf(ratings, scans)}
        />
        <div className="space-y-3 border-l-2 border-muted pl-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            after rating, customers chose…
          </p>
          <FunnelRow
            label="Google clicks"
            rightLabel={`${googleClicks.toLocaleString()} · ${pct(googleClicks, ratings)} of ratings`}
            width={widthOf(googleClicks, scans)}
          />
          <FunnelRow
            label="Feedback sent"
            rightLabel={`${feedback.toLocaleString()} · ${pct(feedback, ratings)} of ratings`}
            width={widthOf(feedback, scans)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelRow({
  label,
  rightLabel,
  width,
}: {
  label: string;
  rightLabel: string;
  width: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {rightLabel}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          aria-hidden="true"
          className="h-full rounded-full bg-foreground/80"
          style={{ width }}
        />
      </div>
    </div>
  );
}
