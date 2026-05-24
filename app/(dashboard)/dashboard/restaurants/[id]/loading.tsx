export default function Loading() {
  return (
    <div className="space-y-10">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted/50" />

      <div className="space-y-2">
        <div className="h-10 w-72 animate-pulse rounded-md bg-muted/50" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
      </div>

      <div className="space-y-4">
        <div className="h-6 w-28 animate-pulse rounded bg-muted/50" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border bg-muted/30"
            />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-lg border bg-muted/30" />
          <div className="h-64 animate-pulse rounded-lg border bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
