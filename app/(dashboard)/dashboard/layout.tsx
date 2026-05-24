import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/dal";
import { AccountMenu } from "@/components/dashboard/account-menu";

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
          <AccountMenu email={session.email} />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
