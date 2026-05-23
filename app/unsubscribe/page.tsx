import { UnsubscribeForm } from "@/components/unsubscribe/unsubscribe-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ token?: string }>;

export default async function UnsubscribePage(props: {
  searchParams: SearchParams;
}) {
  const { token } = await props.searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="font-serif text-2xl">
            Unsubscribe from weekly summaries
          </CardTitle>
          <CardDescription>
            Reputation OS sends a short weekly recap to restaurant owners.
            You can turn it off here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? (
            <UnsubscribeForm token={token} />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              Missing unsubscribe token. Click the link in your email again,
              or sign in and toggle off weekly summaries in your dashboard
              settings.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
