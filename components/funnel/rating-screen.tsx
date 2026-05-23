"use client";

import { useState } from "react";
import { StarRating } from "./star-rating";

type Props = {
  businessName: string;
  logoUrl?: string | null;
  onRate: (rating: number) => void;
};

export function RatingScreen({ businessName, logoUrl, onRate }: Props) {
  const [value, setValue] = useState(0);

  const handleChange = (n: number) => {
    setValue(n);
    onRate(n);
  };

  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <div className="space-y-3">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="mx-auto size-20 rounded-md border object-cover"
          />
        )}
        <h1 className="font-serif text-4xl tracking-tight">
          {businessName}
        </h1>
        <p className="text-base text-muted-foreground">
          How was your experience today?
        </p>
      </div>
      <StarRating value={value} onChange={handleChange} />
      <p className="font-serif italic text-sm text-muted-foreground">
        Tap a star to continue.
      </p>
    </section>
  );
}
