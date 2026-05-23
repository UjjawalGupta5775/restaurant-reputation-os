import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="max-w-xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Restaurant Reputation OS
        </h1>
        <p className="text-muted-foreground">
          Turn real dining experiences into public reviews and operational
          insights — without compromising authenticity.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/auth/login"
          className={buttonVariants()}
        >
          Sign in
        </Link>
        <a
          href="mailto:hello@example.com?subject=Reputation%20OS%20access%20request"
          className={buttonVariants({ variant: "outline" })}
        >
          Request access
        </a>
      </div>
    </main>
  );
}
