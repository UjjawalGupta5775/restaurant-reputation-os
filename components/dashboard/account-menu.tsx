"use client";

import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { signOut } from "@/lib/actions/auth";

type Props = {
  email: string | null;
};

// Account dropdown for the dashboard header. SaaS-standard pattern: email +
// chevron trigger, dropdown items for Account / Billing / Notifications / Sign
// out. Built on @base-ui/react/menu — the same primitive family as Button —
// so styling stays consistent and we don't pull in a parallel UI library.
//
// Sign out remains a real <form action={signOut}> inside the menu item so the
// most critical action survives a JS-disabled environment (the trigger itself
// won't open without JS, but progressive enhancement matters here).
export function AccountMenu({ email }: Props) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Account menu"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        <span className="hidden max-w-[180px] truncate sm:inline">
          {email ?? "Account"}
        </span>
        <span className="sm:hidden">Account</span>
        <ChevronDown aria-hidden className="size-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50">
          <Menu.Popup className="min-w-[180px] origin-top-right rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            <Menu.Item
              render={
                <Link
                  href="/dashboard/settings/account"
                  className="flex w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                >
                  Account
                </Link>
              }
            />
            <Menu.Item
              render={
                <Link
                  href="/dashboard/settings/billing"
                  className="flex w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                >
                  Billing
                </Link>
              }
            />
            <Menu.Item
              render={
                <Link
                  href="/dashboard/settings"
                  className="flex w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                >
                  Notifications
                </Link>
              }
            />
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item
              closeOnClick={false}
              className="rounded-md outline-none data-[highlighted]:bg-muted"
            >
              <form action={signOut}>
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-sm outline-none"
                >
                  Sign out
                </button>
              </form>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
