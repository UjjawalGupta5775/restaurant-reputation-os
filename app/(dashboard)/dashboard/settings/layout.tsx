import Link from "next/link";
import { SettingsNav } from "@/components/dashboard/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <div className="text-sm">
        <Link
          href="/dashboard"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage notifications, account, and billing.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[180px_1fr]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
