import type { Session } from "@heroiclabs/nakama-js";

export function userIdFromSession(s: Session | null): string {
  if (!s) return "";
  if (s.user_id) return s.user_id;
  try {
    const part = s.token.split(".")[1];
    if (!part) return "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { uid?: string };
    return json.uid ?? "";
  } catch {
    return "";
  }
}
