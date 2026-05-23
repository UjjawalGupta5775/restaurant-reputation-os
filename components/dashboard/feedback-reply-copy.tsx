"use client";

import { useState } from "react";
import type { ResponseTemplate } from "@/lib/queries/response-templates";
import { Button } from "@/components/ui/button";

type Props = {
  templates: ResponseTemplate[];
  context: {
    contactName: string | null;
    rating: number;
    restaurantName: string;
  };
};

function substitute(
  body: string,
  context: Props["context"],
): string {
  // Tokens: {{name}} | {{rating}} | {{restaurant}}. Whitespace inside
  // braces is tolerated so owners can type {{ name }} interchangeably.
  return body
    .replace(/\{\{\s*name\s*\}\}/gi, context.contactName?.trim() || "there")
    .replace(/\{\{\s*rating\s*\}\}/gi, String(context.rating))
    .replace(/\{\{\s*restaurant\s*\}\}/gi, context.restaurantName);
}

export function FeedbackReplyCopy({ templates, context }: Props) {
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (templates.length === 0) return null;

  const handleCopy = async (template: ResponseTemplate) => {
    const text = substitute(template.body, context);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers that block clipboard writes outside of HTTPS
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* swallow */
      }
      document.body.removeChild(ta);
    }
    setCopiedId(template.id);
    setTimeout(() => setCopiedId((id) => (id === template.id ? null : id)), 2000);
  };

  return (
    <div className="relative inline-block">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Copy reply
      </Button>
      {open && (
        <>
          {/* Click-away catcher. */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-md border bg-popover shadow-md"
          >
            <ul className="max-h-72 overflow-y-auto">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleCopy(t)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <span className="block font-medium">
                      {copiedId === t.id ? "Copied!" : t.label}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {t.body}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
