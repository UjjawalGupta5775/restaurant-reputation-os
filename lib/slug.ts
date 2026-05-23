const RESERVED = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "r",
  "login",
  "signup",
  "signin",
  "signout",
  "callback",
  "settings",
  "account",
  "static",
  "public",
  "_next",
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

export function baseSlugFor(name: string, fallback = "restaurant"): string {
  const base = slugify(name);
  if (!base) return `${fallback}-r`;
  if (isReservedSlug(base)) return `${base}-r`;
  return base;
}
