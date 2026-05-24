import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        404
      </p>
      <h1 className="font-serif text-3xl tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link you followed may be broken, or the page may have been moved.
      </p>
      <Link
        href="/"
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Go home
      </Link>
    </main>
  );
}
