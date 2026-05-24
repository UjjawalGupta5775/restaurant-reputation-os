"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import {
  createChip,
  deleteChip,
  reorderChips,
  toggleChip,
  updateChip,
  updateChipSettings,
  type ChipActionState,
} from "@/lib/actions/review-chips";
import type { ChipSettings, ReviewChip } from "@/lib/queries/review-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  businessId: string;
  chips: ReviewChip[];
  settings: ChipSettings;
};

const EDITORIAL = [
  "Write neutral observations (\"Wood-fired crust\", \"Patio seating\"), not sentiment prompts (\"Amazing!\").",
  "Aim for 2–4 words per chip. Customers tap them — they don't read them.",
  "Mix in your specific dishes or features so reviews don't all read the same.",
];

export function ReviewChipManager({ businessId, chips, settings }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">
            Editorial guidelines
          </CardTitle>
          <CardDescription>
            Chips help customers draft real reviews faster — they aren&apos;t
            a way to coach 5-star sentiment. Keep them factual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {EDITORIAL.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-foreground">
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <SettingsForm businessId={businessId} settings={settings} />

      <CreateForm businessId={businessId} />

      <ChipList businessId={businessId} chips={chips} />
    </div>
  );
}

function SettingsForm({
  businessId,
  settings,
}: {
  businessId: string;
  settings: ChipSettings;
}) {
  const [state, action, pending] = useActionState<ChipActionState, FormData>(
    updateChipSettings,
    undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">Display behaviour</CardTitle>
        <CardDescription>
          How chips appear to customers on your review page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="businessId" value={businessId} />

          <div className="space-y-2">
            <Label htmlFor="displayMode">Order</Label>
            <select
              id="displayMode"
              name="displayMode"
              defaultValue={settings.displayMode}
              className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="manual">Manual — your order</option>
              <option value="random">Random — shuffle per visit</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Random rotates which chips appear first so high-traffic
              restaurants get varied reviews instead of the same phrases.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayLimit">Chips shown to customers</Label>
            <Input
              id="displayLimit"
              name="displayLimit"
              type="number"
              min={4}
              max={16}
              defaultValue={settings.displayLimit}
              className="max-w-24"
            />
            <p className="text-xs text-muted-foreground">
              4 to 16. Defaults to 8 — enough variety without overwhelming.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending} size="sm">
              {pending ? "Saving…" : "Save settings"}
            </Button>
            {state?.ok && state.message && (
              <p role="status" className="text-sm text-muted-foreground">
                {state.message}
              </p>
            )}
            {state && !state.ok && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CreateForm({ businessId }: { businessId: string }) {
  const [state, action, pending] = useActionState<ChipActionState, FormData>(
    createChip,
    undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">Add a chip</CardTitle>
        <CardDescription>2–40 characters. Tap-sized phrases.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={action}
          className="space-y-3"
          // Reset the field on success by reusing the success state as a
          // remount key — Next 16 servers actions don't auto-reset forms.
          key={state?.ok ? `new-${state.message ?? "ok"}` : "new"}
        >
          <input type="hidden" name="businessId" value={businessId} />
          <div className="space-y-2">
            <Label htmlFor="new-chip">Label</Label>
            <Input
              id="new-chip"
              name="label"
              required
              minLength={2}
              maxLength={40}
              placeholder="e.g. Wood-fired crust"
            />
            {state && !state.ok && state.fieldErrors?.label?.map((m) => (
              <p key={m} role="alert" className="text-sm text-destructive">
                {m}
              </p>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending} size="sm">
              {pending ? "Adding…" : "Add chip"}
            </Button>
            {state?.ok && state.message && (
              <p role="status" className="text-sm text-muted-foreground">
                {state.message}
              </p>
            )}
            {state && !state.ok && !state.fieldErrors && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ChipList({
  businessId,
  chips,
}: {
  businessId: string;
  chips: ReviewChip[];
}) {
  // We keep a local copy so move-up/down feels instant; the actual
  // server-side reorder fires through a transition. Server state is
  // re-fetched on revalidatePath so any drift is corrected on next nav.
  const [local, setLocal] = useState(chips);
  const [prevChips, setPrevChips] = useState(chips);
  const [, startReorder] = useTransition();
  const [reorderState, setReorderState] = useState<string | null>(null);

  // Canonical "derive state from props" reset: when the server payload
  // changes (revalidatePath after an action), accept it as the new
  // baseline. Done during render — not in an effect — to avoid the
  // cascading-render lint and to keep the new order visible immediately.
  if (chips !== prevChips) {
    setPrevChips(chips);
    setLocal(chips);
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= local.length) return;
    const next = local.slice();
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    setLocal(next);

    const orderJson = JSON.stringify(next.map((c) => c.id));
    const fd = new FormData();
    fd.set("businessId", businessId);
    fd.set("orderJson", orderJson);
    startReorder(async () => {
      const res = await reorderChips(undefined, fd);
      if (res && !res.ok) {
        setReorderState(res.error);
        // Roll back optimistic move if the server rejected it.
        setLocal(chips);
      } else {
        setReorderState(null);
      }
    });
  };

  if (local.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="font-serif italic text-base text-muted-foreground">
            No chips yet. Add your first above.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Your chips
        </p>
        <p className="text-xs text-muted-foreground">
          {local.filter((c) => c.isActive).length} active of {local.length}
        </p>
      </div>
      {reorderState && (
        <p role="alert" className="text-sm text-destructive">
          {reorderState}
        </p>
      )}
      <ul className="space-y-2">
        {local.map((chip, index) => (
          <li key={chip.id}>
            <ChipRow
              chip={chip}
              businessId={businessId}
              isFirst={index === 0}
              isLast={index === local.length - 1}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChipRow({
  chip,
  businessId,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  chip: ReviewChip;
  businessId: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <div className="flex flex-col">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label="Move up"
            className="h-6 w-6 p-0"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label="Move down"
            className="h-6 w-6 p-0"
          >
            <ArrowDown className="size-3.5" />
          </Button>
        </div>

        {editing ? (
          <EditForm
            chip={chip}
            businessId={businessId}
            onDone={() => setEditing(false)}
          />
        ) : (
          <ReadView
            chip={chip}
            businessId={businessId}
            onEdit={() => setEditing(true)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ReadView({
  chip,
  businessId,
  onEdit,
}: {
  chip: ReviewChip;
  businessId: string;
  onEdit: () => void;
}) {
  const [, toggleAction, togglePending] = useActionState<
    ChipActionState,
    FormData
  >(toggleChip, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState<
    ChipActionState,
    FormData
  >(deleteChip, undefined);

  return (
    <div className="flex flex-1 flex-wrap items-center gap-3">
      <span
        className={
          chip.isActive
            ? "rounded-full border bg-background px-3 py-1 text-sm"
            : "rounded-full border border-dashed bg-muted/40 px-3 py-1 text-sm text-muted-foreground line-through"
        }
      >
        {chip.label}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <form action={toggleAction}>
          <input type="hidden" name="id" value={chip.id} />
          <input type="hidden" name="businessId" value={businessId} />
          <input
            type="hidden"
            name="next"
            value={chip.isActive ? "false" : "true"}
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={togglePending}
            aria-label={chip.isActive ? "Hide from customers" : "Show to customers"}
          >
            {chip.isActive ? (
              <Eye className="size-4" aria-hidden="true" />
            ) : (
              <EyeOff className="size-4" aria-hidden="true" />
            )}
            <span className="ml-1.5 text-xs">
              {chip.isActive ? "Active" : "Hidden"}
            </span>
          </Button>
        </form>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={chip.id} />
          <input type="hidden" name="businessId" value={businessId} />
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
      {deleteState && !deleteState.ok && (
        <p role="alert" className="basis-full text-sm text-destructive">
          {deleteState.error}
        </p>
      )}
    </div>
  );
}

function EditForm({
  chip,
  businessId,
  onDone,
}: {
  chip: ReviewChip;
  businessId: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ChipActionState, FormData>(
    updateChip,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-1 flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={chip.id} />
      <input type="hidden" name="businessId" value={businessId} />
      <input
        type="hidden"
        name="isActive"
        value={chip.isActive ? "on" : ""}
      />
      <Input
        name="label"
        defaultValue={chip.label}
        required
        minLength={2}
        maxLength={40}
        className="max-w-xs flex-1"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onDone}>
        Cancel
      </Button>
      {state && !state.ok && state.fieldErrors?.label?.map((m) => (
        <p key={m} role="alert" className="basis-full text-sm text-destructive">
          {m}
        </p>
      ))}
      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="basis-full text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
