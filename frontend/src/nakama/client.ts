import { Client, Session, Socket } from "@heroiclabs/nakama-js";
import { nakamaConfig } from "./config";

let client: Client | null = null;
let session: Session | null = null;

const DEVICE_KEY = "ttt_device_id";
const SESSION_KEY = "ttt_session_tokens";
export const DISPLAY_NAME_KEY = "ttt_display_name";

export function getClient(): Client {
  if (!client) {
    client = new Client(
      nakamaConfig.serverKey,
      nakamaConfig.host,
      nakamaConfig.port,
      nakamaConfig.useSSL,
    );
  }
  return client;
}

export function resetClient(): void {
  client = null;
}

export function getSession(): Session | null {
  return session;
}

export function setSession(s: Session | null): void {
  session = s;
  try {
    if (s) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: s.token, refresh: s.refresh_token }));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `guest_${Math.random().toString(36).slice(2)}`;
  }
}

export function getStoredDisplayName(): string | null {
  try {
    const v = localStorage.getItem(DISPLAY_NAME_KEY);
    const t = v?.trim();
    return t ? t : null;
  } catch {
    return null;
  }
}

export function setStoredDisplayName(name: string): void {
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name.trim());
  } catch {
    // ignore
  }
}

/**
 * Whether this browser already has a Nakama device id (created on first successful login).
 * Used to show “sign in again” copy after sign-out.
 */
export function hasLinkedDevice(): boolean {
  try {
    const id = localStorage.getItem(DEVICE_KEY)?.trim();
    return !!id;
  } catch {
    return false;
  }
}

/**
 * Sign out: clears session and saved display name, but keeps the device id so the same
 * Nakama user (leaderboard stats, etc.) is restored when you sign in again on this browser.
 */
export function signOutSession(): void {
  try {
    localStorage.removeItem(DISPLAY_NAME_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  session = null;
  resetClient();
}

/** Clears device binding too — next login creates a brand-new Nakama account on this browser. */
export function wipeAllLocalIdentity(): void {
  try {
    localStorage.removeItem(DISPLAY_NAME_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    // ignore
  }
  session = null;
  resetClient();
}

/** @deprecated Use signOutSession (keeps device) or wipeAllLocalIdentity (full reset). */
export function clearLocalAuth(): void {
  signOutSession();
}

export function tryRestoreSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { token, refresh } = JSON.parse(raw) as { token?: string; refresh?: string };
    if (!token || !refresh) return null;
    const s = Session.restore(token, refresh);
    if (s.isexpired(Date.now() / 1000)) {
      localStorage.removeItem(SESSION_KEY);
      session = null;
      return null;
    }
    setSession(s);
    return s;
  } catch {
    return null;
  }
}

/**
 * Device auth with Nakama username (shown on leaderboard). Creates or loads the device account,
 * then ensures `username` is stored on the account for leaderboard APIs.
 */
export async function authenticateWithDisplayName(username: string): Promise<Session> {
  const c = getClient();
  const id = getOrCreateDeviceId();
  const s = await c.authenticateDevice(id, true, username);
  setSession(s);
  try {
    await c.updateAccount(s, { username, display_name: username });
  } catch {
    try {
      await c.updateAccount(s, { display_name: username });
    } catch {
      // Session is still valid; server may only show auto username until profile updates.
    }
  }
  return s;
}

/** @deprecated Prefer authenticateWithDisplayName after the user picks a name. */
export async function authenticateDevice(): Promise<Session> {
  return authenticateWithDisplayName("Player");
}

export function createSocket(): Socket {
  const c = getClient();
  const s = session;
  if (!s) throw new Error("Not authenticated");
  return c.createSocket(nakamaConfig.useSSL, false);
}
