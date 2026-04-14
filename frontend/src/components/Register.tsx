import { useState } from "react";
import { validatePlayerName } from "../util/playerName";

type Props = {
  onRegistered: (displayName: string) => Promise<void>;
  /** This browser already has a Nakama device account (e.g. after sign-out). */
  returningDevice: boolean;
  /** Clear device binding and start as a completely new account on this browser. */
  onWipeDeviceAccount: () => void;
  busy: boolean;
  error: string | null;
};

export function Register({ onRegistered, returningDevice, onWipeDeviceAccount, busy, error }: Props) {
  const [value, setValue] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setLocalErr(null);
    const v = validatePlayerName(value);
    if (!v.ok) {
      setLocalErr(v.error);
      return;
    }
    setSubmitting(true);
    try {
      await onRegistered(v.name);
    } catch {
      // parent sets error
    } finally {
      setSubmitting(false);
    }
  };

  const banner = error ?? localErr;

  return (
    <div className="page">
      <div className="card register-card">
        <h1>{returningDevice ? "Sign in" : "Welcome"}</h1>
        {returningDevice ? (
          <p className="muted">
            You signed out on this browser. Enter the same display name you used before to load your wins and profile.
            Your account is tied to this device until you choose a different option below.
          </p>
        ) : (
          <p className="muted">Choose a display name. It appears on the leaderboard and identifies you in matches.</p>
        )}

        {banner ? <div className="banner error">{banner}</div> : null}

        <label className="register-label">
          <span className="muted small">Display name</span>
          <input
            className="input"
            autoComplete="username"
            placeholder="e.g. Monika_Avnish"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </label>

        <button
          type="button"
          className="primary full register-btn"
          disabled={busy || submitting}
          onClick={() => void submit()}
        >
          {busy || submitting ? "Connecting…" : returningDevice ? "Sign in & play" : "Continue"}
        </button>

        {returningDevice ? (
          <p className="register-alt muted small">
            Need a separate account on this computer?{" "}
            <button type="button" className="linkish" onClick={() => onWipeDeviceAccount()}>
              Start fresh (new player)
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
