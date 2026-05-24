// Server component — no client interactivity needed. Rendered by
// /r/[slug] when getOperationalStatusPublic returns ok=false.
//
// Copy intentionally avoids internal language ("subscription", "billing",
// "payment failed", "trial expired"). To the customer at the table, the
// surface is just paused; the restaurant exists and might be back soon.
// Anything more specific would either embarrass the owner or invite
// "why don't you pay" comments to staff.

type Props = {
  businessName: string;
  logoUrl: string | null;
};

export function PausedRestaurantNotice({ businessName, logoUrl }: Props) {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="size-20 rounded-2xl border object-cover shadow-sm"
        />
      ) : null}

      <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
        {businessName}
      </h1>

      <div className="space-y-2 max-w-sm">
        <p className="font-serif italic text-2xl leading-snug">
          Reviews are paused right now.
        </p>
        <p className="text-sm text-muted-foreground">
          Thanks for visiting. Please check back another time.
        </p>
      </div>
    </section>
  );
}
