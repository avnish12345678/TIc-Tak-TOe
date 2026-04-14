/** Nakama username: keep ASCII-ish for broad server compatibility. */
const RE = /^[a-zA-Z0-9 _\-]+$/;

export type NameResult = { ok: true; name: string } | { ok: false; error: string };

export function validatePlayerName(raw: string): NameResult {
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length < 2) return { ok: false, error: "Use at least 2 characters." };
  if (t.length > 20) return { ok: false, error: "Use at most 20 characters." };
  if (!RE.test(t)) {
    return { ok: false, error: "Letters, numbers, spaces, underscore, or hyphen only." };
  }
  return { ok: true, name: t };
}
