import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { DigestToggleForm } from "@/components/dashboard/digest-toggle-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function loadEnabled(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("weekly_digest_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  // Default to true: the 0009 backfill seeded every existing user, but if
  // a user signed up between migration and now and the post-signup insert
  // hasn't run, treat them as opted-in for consistency with new accounts.
  return data?.weekly_digest_enabled ?? true;
}

export default async function SettingsPage() {
  const session = await verifySession();
  const enabled = await loadEnabled(session.userId);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your email notifications.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Email</CardTitle>
          <CardDescription>
            Choose what we send to {session.email ?? "your account"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DigestToggleForm initialEnabled={enabled} />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
