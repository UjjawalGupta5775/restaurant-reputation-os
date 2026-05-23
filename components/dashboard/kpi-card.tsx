import { Card, CardContent } from "@/components/ui/card";

type Props = {
  label: string;
  value: string;
  sub?: string;
};

export function KpiCard({ label, value, sub }: Props) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className="font-serif text-3xl tabular-nums tracking-tight">
          {value}
        </p>
        {sub ? (
          <p className="text-xs tabular-nums text-muted-foreground">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
