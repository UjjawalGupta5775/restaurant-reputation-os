import { verifySession, getCurrentUser } from "@/lib/dal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangeEmailForm } from "@/components/dashboard/change-email-form";
import { ChangePasswordForm } from "@/components/dashboard/change-password-form";
import { DeactivateAccountForm } from "@/components/dashboard/deactivate-account-form";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const session = await verifySession();
  const user = await getCurrentUser();

  // Supabase populates new_email + email_change_sent_at on the auth user
  // while a change is pending (between request and final confirmation).
  // Surfacing them removes the "did the email actually send?" ambiguity.
  const pendingEmail = user?.new_email ?? null;
  const pendingSince = user?.email_change_sent_at ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Email</CardTitle>
          <CardDescription>
            Update the email used to sign in and receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm
            currentEmail={session.email}
            pendingEmail={pendingEmail}
            pendingSince={pendingSince}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Password</CardTitle>
          <CardDescription>
            Pick a new password. Minimum 8 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card className="border-l-2 border-l-red-500">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Deactivate account
          </CardTitle>
          <CardDescription>
            This signs you out and locks your account. Your restaurants and
            their data remain — contact support to reactivate or fully delete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeactivateAccountForm currentEmail={session.email} />
        </CardContent>
      </Card>
    </div>
  );
}
