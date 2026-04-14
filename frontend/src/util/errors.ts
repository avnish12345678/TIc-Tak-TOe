/**
 * Nakama JS client throws raw `Response` on non-2xx HTTP (see api client `throw response`).
 * `String(response)` is useless — normalize for UI.
 */
export async function formatNakamaError(e: unknown): Promise<string> {
  if (e instanceof Response) {
    let detail = "";
    try {
      const ct = (e.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const j = (await e.clone().json()) as { message?: string; error?: string };
        detail = (j.message || j.error || "").trim();
      } else {
        detail = (await e.clone().text()).trim().slice(0, 400);
      }
    } catch {
      // ignore body parse errors
    }
    const base = `HTTP ${e.status}${e.statusText ? ` ${e.statusText}` : ""}`.trim();
    return detail ? `${base}: ${detail}` : base;
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
