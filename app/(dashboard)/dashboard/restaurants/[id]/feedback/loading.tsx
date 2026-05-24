export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted/50" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted/40" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border bg-muted/30"
          />
        ))}
      </div>
    </div>
  );
}
