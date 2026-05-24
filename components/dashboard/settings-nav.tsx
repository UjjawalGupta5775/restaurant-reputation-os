"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/dashboard/settings", label: "Notifications" },
  { href: "/dashboard/settings/account", label: "Account" },
  { href: "/dashboard/settings/billing", label: "Billing" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections">
      <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
        {sections.map((s) => {
          const active = pathname === s.href;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
