import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/dal";
import { listBusinessesForOwner } from "@/lib/queries/businesses";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await getSessionRole();
  const businesses = await listBusinessesForOwner();

  // Owner-scope rendering:
  // 0 restaurants → "no access yet" empty state (an invited owner whose
  //   admin hasn't linked them to anything yet, or a stale invite).
  // 1 restaurant → jump straight to that restaurant's analytics page.
  //   Single-property owners shouldn't need a list view.
  // 2+ restaurants → list view (multi-property operator).
  if (businesses.length === 1) {
    redirect(`/dashboard/restaurants/${businesses[0].id}`);
  }

  if (businesses.length === 0) {
    return (
      <div className="space-y-10">
        <header className="space-y-2">
          <h1 className="font-serif text-3xl tracking-tight">Welcome</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {session.email ?? session.userId}.
          </p>
        </header>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-serif italic text-base text-muted-foreground max-w-md mx-auto">
              You don&apos;t have access to any restaurants yet. Your admin
              will link your account to a restaurant — once they do, refresh
              this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Your restaurants</h1>
        <p className="text-sm text-muted-foreground">
          Pick a restaurant to view its analytics, campaigns, and feedback.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {businesses.map((b) => (
          <Link
            key={b.id}
            href={`/dashboard/restaurants/${b.id}`}
            className="block"
          >
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="truncate font-serif text-xl">
                  {b.name}
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  /r/{b.slug}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <span className="tabular-nums">{b.campaignCount}</span>{" "}
                {b.campaignCount === 1 ? "campaign" : "campaigns"}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
