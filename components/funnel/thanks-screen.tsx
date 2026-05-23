"use client";

import { useEffect, useRef } from "react";

type Props = {
  path: "google" | "private";
  onViewed: (path: "google" | "private") => void;
};

export function ThanksScreen({ path, onViewed }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    onViewed(path);
  }, [path, onViewed]);

  return (
    <section className="flex flex-col items-center gap-5 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700 shadow-sm shadow-emerald-500/10">
        <span aria-hidden="true">✓</span>
      </div>
      <h2 className="font-serif italic text-4xl tracking-tight">
        Thank you
      </h2>
      <p className="max-w-sm text-muted-foreground">
        {path === "private"
          ? "Your note went straight to the owner. They appreciate it."
          : "Thanks for taking a moment to leave a public review."}
      </p>
    </section>
  );
}
