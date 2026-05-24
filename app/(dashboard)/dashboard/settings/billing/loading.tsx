export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-72 animate-pulse rounded bg-muted/40" />
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border bg-muted/30"
          />
        ))}
      </div>
    </div>
  );
}
