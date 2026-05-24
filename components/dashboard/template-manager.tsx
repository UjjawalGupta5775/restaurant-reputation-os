"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createResponseTemplate,
  updateResponseTemplate,
  deleteResponseTemplate,
  type TemplateActionState,
} from "@/lib/actions/response-templates";
import type { ResponseTemplate } from "@/lib/queries/response-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  businessId: string;
  templates: ResponseTemplate[];
};

const TOKEN_HELP =
  "Tokens you can use: {{name}}, {{rating}}, {{business}}. They're substituted when you copy a reply.";

export function TemplateManager({ businessId, templates }: Props) {
  return (
    <div className="space-y-6">
      <CreateForm businessId={businessId} />
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Your templates
        </p>
        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="font-serif italic text-base text-muted-foreground">
                No templates yet. Add one above to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {templates.map((t) => (
              <li key={t.id}>
                <TemplateRow template={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateForm({ businessId }: { businessId: string }) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    createResponseTemplate,
    undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">Add a template</CardTitle>
        <CardDescription>{TOKEN_HELP}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4" key={state?.ok ? "reset" : "form"}>
          <input type="hidden" name="businessId" value={businessId} />
          <div className="space-y-2">
            <Label htmlFor="new-label">Label</Label>
            <Input
              id="new-label"
              name="label"
              required
              maxLength={80}
              placeholder="e.g. Apology + dessert offer"
            />
            {state && !state.ok && state.fieldErrors?.label?.map((m) => (
              <p key={m} role="alert" className="text-sm text-destructive">{m}</p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-body">Body</Label>
            <Textarea
              id="new-body"
              name="body"
              required
              maxLength={1000}
              rows={4}
              placeholder="Hi {{name}}, sorry to hear your visit fell short. We'd love a chance to make it right — come back and dessert is on us."
            />
            {state && !state.ok && state.fieldErrors?.body?.map((m) => (
              <p key={m} role="alert" className="text-sm text-destructive">{m}</p>
            ))}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add template"}
          </Button>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">{state.error}</p>
          )}
          {state?.ok && state.message && (
            <p role="status" className="text-sm text-muted-foreground">{state.message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function TemplateRow({ template }: { template: ResponseTemplate }) {
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {editing ? (
          <EditForm template={template} onDone={() => setEditing(false)} />
        ) : (
          <ReadView template={template} onEdit={() => setEditing(true)} />
        )}
      </CardContent>
    </Card>
  );
}

function ReadView({
  template,
  onEdit,
}: {
  template: ResponseTemplate;
  onEdit: () => void;
}) {
  const [deleteState, deleteAction, deletePending] = useActionState<
    TemplateActionState,
    FormData
  >(deleteResponseTemplate, undefined);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{template.label}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
          >
            Edit
          </Button>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={template.id} />
            <input type="hidden" name="businessId" value={template.businessId} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={deletePending}
              className="text-destructive hover:text-destructive"
            >
              {deletePending ? "Deleting…" : "Delete"}
            </Button>
          </form>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{template.body}</p>
      {deleteState && !deleteState.ok && (
        <p role="alert" className="text-sm text-destructive">{deleteState.error}</p>
      )}
    </div>
  );
}

function EditForm({
  template,
  onDone,
}: {
  template: ResponseTemplate;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    updateResponseTemplate,
    undefined,
  );

  // Close the editor once the update succeeds; useEffect avoids side
  // effects during render and lets React commit the success state first.
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="businessId" value={template.businessId} />
      <div className="space-y-2">
        <Label htmlFor={`label-${template.id}`}>Label</Label>
        <Input
          id={`label-${template.id}`}
          name="label"
          required
          maxLength={80}
          defaultValue={template.label}
        />
        {state && !state.ok && state.fieldErrors?.label?.map((m) => (
          <p key={m} role="alert" className="text-sm text-destructive">{m}</p>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`body-${template.id}`}>Body</Label>
        <Textarea
          id={`body-${template.id}`}
          name="body"
          required
          maxLength={1000}
          rows={4}
          defaultValue={template.body}
        />
        {state && !state.ok && state.fieldErrors?.body?.map((m) => (
          <p key={m} role="alert" className="text-sm text-destructive">{m}</p>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      )}
    </form>
  );
}
