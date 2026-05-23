import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SearchParams = Promise<{
  token_hash?: string;
  type?: string;
  next?: string;
}>;

// Interstitial confirm page: GET shows a button, POST verifies.
// Email-link scanners (Gmail tabs, disposable services, Outlook Safe
// Links) issue GET requests when crawling URLs; they don't click form
// buttons. Without this, a scanner's GET would consume the one-shot
// OTP before the human can click. We only call verifyOtp inside the
// server action, which runs on POST.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    redirect("/auth/login?error=invite_expired");
  }

  async function confirm(formData: FormData) {
    "use server";
    const submittedTokenHash = formData.get("token_hash");
    const submittedType = formData.get("type");
    const submittedNext = formData.get("next");

    if (typeof submittedTokenHash !== "string" || typeof submittedType !== "string") {
      redirect("/auth/login?error=invite_expired");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: submittedType as EmailOtpType,
      token_hash: submittedTokenHash,
    });

    if (error) {
      redirect("/auth/login?error=invite_expired");
    }

    redirect(
      typeof submittedNext === "string" && submittedNext.startsWith("/")
        ? submittedNext
        : "/auth/invite",
    );
  }

  const isRecovery = type === "recovery";
  const copy = isRecovery
    ? {
        title: "Reset your password",
        description: "Click below to verify your reset link and choose a new password.",
        body: "Your reset link is ready. Continue to set a new password.",
        button: "Continue to reset",
      }
    : {
        title: "Welcome aboard",
        description: "Click below to confirm your email and set up your account.",
        body: "Your invite is ready. Continue to choose a password.",
        button: "Continue",
      };

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <form action={confirm}>
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next ?? "/auth/invite"} />
          <CardContent>
            <p className="font-serif italic text-sm text-muted-foreground">
              {copy.body}
            </p>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full">
              {copy.button}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
