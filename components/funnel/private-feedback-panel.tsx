"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  submitFeedback,
  type FeedbackFormState,
} from "@/lib/actions/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  businessId: string;
  campaignId: string | null;
  sessionId: string;
  rating: number;
  onFirstInteraction: () => void;
  onSubmitted: () => void;
};

export function PrivateFeedbackPanel({
  businessId,
  campaignId,
  sessionId,
  rating,
  onFirstInteraction,
  onSubmitted,
}: Props) {
  const [state, action, pending] = useActionState<FeedbackFormState, FormData>(
    submitFeedback,
    undefined,
  );
  const interacted = useRef(false);
  const submittedRef = useRef(false);

  const flagInteraction = () => {
    if (!interacted.current) {
      interacted.current = true;
      onFirstInteraction();
    }
  };

  useEffect(() => {
    if (state?.ok && !submittedRef.current) {
      submittedRef.current = true;
      onSubmitted();
    }
  }, [state, onSubmitted]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          Send private feedback
        </CardTitle>
        <CardDescription>
          Goes straight to the owner. Not posted publicly.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="campaignId" value={campaignId ?? ""} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="rating" value={rating} />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedbackText">What should we know?</Label>
            <Textarea
              id="feedbackText"
              name="feedbackText"
              rows={4}
              maxLength={2000}
              onFocus={flagInteraction}
              onChange={flagInteraction}
              placeholder="Tell the owner anything they should hear directly."
              className="min-h-28"
            />
            {state?.fieldErrors?.feedbackText?.map((msg) => (
              <p
                key={msg}
                role="alert"
                className="text-sm text-destructive"
              >
                {msg}
              </p>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactName">
                Name{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="contactName"
                name="contactName"
                type="text"
                autoComplete="name"
                maxLength={120}
                onFocus={flagInteraction}
                onChange={flagInteraction}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">
                Phone{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="contactPhone"
                name="contactPhone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                onFocus={flagInteraction}
                onChange={flagInteraction}
              />
            </div>
          </div>
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Sending…" : "Send feedback"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
