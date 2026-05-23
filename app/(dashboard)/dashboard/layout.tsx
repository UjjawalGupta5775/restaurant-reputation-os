import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/dal";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionRole();
  // Super-admins live on /admin. Keep /dashboard as the owner-only surface.
  if (session.isSuperAdmin) redirect("/admin");

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div aria-label="Reputation OS" className="font-serif text-lg tracking-tight">
            Reputation OS
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.email ?? session.userId}
            </span>
            <Link
              href="/dashboard/settings"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Settings
            </Link>
            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
