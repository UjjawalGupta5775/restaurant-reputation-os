const STORAGE_KEY = "rros_sid";

export function getSessionId(): string {
  if (typeof window === "undefined") {
    throw new Error("getSessionId() must be called on the client.");
  }
  const existing = window.sessionStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  window.sessionStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}
