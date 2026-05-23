import type { DailyScan } from "@/lib/queries/analytics";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  data: DailyScan[];
  periodLabel: string;
};

const W = 600;
const H = 140;
const PADDING = { top: 8, right: 8, bottom: 22, left: 28 };

export function DailyScansChart({ data, periodLabel }: Props) {
  const max = Math.max(1, ...data.map((d) => d.scans));
  const total = data.reduce((s, d) => s + d.scans, 0);

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            {`Daily scans · ${periodLabel}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center">
          <p className="font-serif italic text-base text-muted-foreground max-w-sm mx-auto">
            Nothing scanned in this window. The chart fills in as scans roll
            through.
          </p>
        </CardContent>
      </Card>
    );
  }

  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;
  const barSpan = innerW / data.length;

  const labelIdx = [
    0,
    Math.floor(data.length / 2),
    data.length - 1,
  ].filter((i, idx, arr) => arr.indexOf(i) === idx);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          {`Daily scans · ${periodLabel}`}
        </CardTitle>
        <p className="text-sm tabular-nums text-muted-foreground">
          {total.toLocaleString()} scan{total === 1 ? "" : "s"} · peak {max} on
          a single day
        </p>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Daily scans for the last ${data.length} days. Total ${total}, peak ${max}.`}
        >
          <line
            x1={PADDING.left}
            x2={W - PADDING.right}
            y1={H - PADDING.bottom}
            y2={H - PADDING.bottom}
            className="stroke-border"
            strokeWidth={1}
          />
          <text
            x={PADDING.left - 4}
            y={PADDING.top + 8}
            textAnchor="end"
            className="fill-muted-foreground text-[10px] tabular-nums"
          >
            {max}
          </text>
          <text
            x={PADDING.left - 4}
            y={H - PADDING.bottom + 2}
            textAnchor="end"
            className="fill-muted-foreground text-[10px] tabular-nums"
          >
            0
          </text>
          {data.map((d, i) => {
            const h = (d.scans / max) * innerH;
            const x = PADDING.left + i * barSpan;
            const y = H - PADDING.bottom - h;
            const w = Math.max(2, barSpan - 2);
            return (
              <rect
                key={d.date}
                x={x + 1}
                y={y}
                width={w}
                height={Math.max(h, d.scans > 0 ? 1 : 0)}
                rx={1.5}
                className={
                  d.scans > 0
                    ? "fill-foreground/80"
                    : "fill-muted"
                }
              >
                <title>
                  {d.date}: {d.scans} scan{d.scans === 1 ? "" : "s"}
                </title>
              </rect>
            );
          })}
          {labelIdx.map((i) => {
            const d = data[i];
            if (!d) return null;
            const x = PADDING.left + i * barSpan + barSpan / 2;
            return (
              <text
                key={i}
                x={x}
                y={H - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {d.date.slice(5)}
              </text>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
