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
        {/*
          Spam honeypot. Hidden from real users (off-screen, no tab stop,
          autoComplete off) but visible to naive form-fill bots. The server
          action drops any submission where "website" is non-empty.
        */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-10000px",
            width: "1px",
            height: "1px",
            overflow: "hidden",
          }}
        >
          <label htmlFor="hp-website">Website</label>
          <input
            id="hp-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedbackText">
              What should we know?{" "}
              <abbr
                title="Required"
                aria-label="required"
                className="text-muted-foreground no-underline"
              >
                *
              </abbr>
            </Label>
            <Textarea
              id="feedbackText"
              name="feedbackText"
              rows={4}
              maxLength={2000}
              required
              aria-required="true"
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
              <Label htmlFor="contactName">Name</Label>
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
              <Label htmlFor="contactPhone">Phone</Label>
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
          <p className="text-xs text-muted-foreground">
            Only the message is required.
          </p>
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={pending}
            className="h-11 w-full px-4 text-sm"
          >
            {pending ? "Sending…" : "Send feedback"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
