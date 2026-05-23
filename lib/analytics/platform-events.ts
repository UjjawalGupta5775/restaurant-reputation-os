// Platform-side analytics events. Distinct from FUNNEL_EVENTS (which are
// emitted from the public customer flow) — these track admin actions on
// the operator side. analytics_events.event_type is plain text in Postgres,
// so this list is the source of truth for valid platform event names.
export const PLATFORM_EVENTS = ["owner_invited", "owner_removed"] as const;

export type PlatformEvent = (typeof PLATFORM_EVENTS)[number];
