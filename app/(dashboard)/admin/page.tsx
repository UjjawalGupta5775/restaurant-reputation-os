import Link from "next/link";
import { listBusinessesForOwner } from "@/lib/queries/businesses";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminHomePage() {
  const businesses = await listBusinessesForOwner();

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl tracking-tight">All restaurants</h1>
          <p className="text-sm text-muted-foreground">
            Every restaurant on the platform. Create new ones, edit settings,
            and manage owners from here.
          </p>
        </div>
        <Link href="/admin/restaurants/new" className={buttonVariants()}>
          New restaurant
        </Link>
      </div>

      {businesses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-serif italic text-base text-muted-foreground max-w-sm mx-auto">
              No restaurants yet. Add the first one to start onboarding owners.
            </p>
            <div className="mt-6">
              <Link
                href="/admin/restaurants/new"
                className={buttonVariants()}
              >
                Add first restaurant
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <Link
              key={b.id}
              href={`/admin/restaurants/${b.id}`}
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
      )}
    </div>
  );
}
